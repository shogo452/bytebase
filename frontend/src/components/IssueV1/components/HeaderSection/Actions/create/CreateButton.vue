<template>
  <NTooltip :disabled="issueCreateErrorList.length === 0" placement="top">
    <template #trigger>
      <NButton
        type="primary"
        size="medium"
        tag="div"
        :disabled="issueCreateErrorList.length > 0 || loading"
        :loading="loading"
        @click="doCreateIssue"
      >
        {{ loading ? $t("common.creating") : $t("common.create") }}
      </NButton>
    </template>

    <template #default>
      <ErrorList :errors="issueCreateErrorList" />
    </template>
  </NTooltip>

  <!-- prevent clicking the page when creating in progress -->
  <div
    v-if="loading"
    v-zindexable="{ enabled: true }"
    class="fixed inset-0 pointer-events-auto flex flex-col items-center justify-center"
    @click.stop.prevent
  />

  <SQLCheckPanel
    v-if="showSQLCheckResultPanel && databaseForTask(project, selectedTask)"
    :project="issue.project"
    :database="databaseForTask(project, selectedTask)"
    :advices="
      checkResultMap[databaseForTask(project, selectedTask).name].advices
    "
    :affected-rows="
      checkResultMap[databaseForTask(project, selectedTask).name].affectedRows
    "
    :risk-level="
      checkResultMap[databaseForTask(project, selectedTask).name].riskLevel
    "
    :confirm="sqlCheckConfirmDialog"
    :override-title="$t('issue.sql-check.sql-review-violations')"
  />
</template>

<script setup lang="ts">
import { NTooltip, NButton } from "naive-ui";
import { zindexable as vZindexable } from "vdirs";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { getValidIssueLabels } from "@/components/IssueV1/components/IssueLabelSelector.vue";
import { ErrorList } from "@/components/IssueV1/components/common";
import {
  isValidStage,
  specForTask,
  useIssueContext,
} from "@/components/IssueV1/logic";
import formatSQL from "@/components/MonacoEditor/sqlFormatter";
import {
  databaseEngineForSpec,
  getLocalSheetByName,
  isValidSpec,
} from "@/components/Plan";
import { getSpecChangeType } from "@/components/Plan/components/SQLCheckSection/common";
import { usePlanSQLCheckContext } from "@/components/Plan/components/SQLCheckSection/context";
import { databaseForTask } from "@/components/Rollout/RolloutDetail";
import { SQLCheckPanel } from "@/components/SQLCheck";
import { STATEMENT_SKIP_CHECK_THRESHOLD } from "@/components/SQLCheck/common";
import {
  issueServiceClient,
  planServiceClient,
  releaseServiceClient,
  rolloutServiceClient,
} from "@/grpcweb";
import { emitWindowEvent } from "@/plugins";
import { PROJECT_V1_ROUTE_ISSUE_DETAIL } from "@/router/dashboard/projectV1";
import { useSheetV1Store, useCurrentProjectV1 } from "@/store";
import { dialectOfEngineV1, languageOfEngineV1 } from "@/types";
import type { Engine } from "@/types/proto/v1/common";
import { Issue, Issue_Type } from "@/types/proto/v1/issue_service";
import type { Plan_ExportDataConfig } from "@/types/proto/v1/plan_service";
import { type Plan_ChangeDatabaseConfig } from "@/types/proto/v1/plan_service";
import { ReleaseFileType } from "@/types/proto/v1/release_service";
import type { Sheet } from "@/types/proto/v1/sheet_service";
import { Advice_Status } from "@/types/proto/v1/sql_service";
import {
  defer,
  extractIssueUID,
  extractProjectResourceName,
  extractSheetUID,
  flattenTaskV1List,
  getSheetStatement,
  hasPermissionToCreateChangeDatabaseIssueInProject,
  issueV1Slug,
  setSheetStatement,
  sheetNameOfTaskV1,
  type Defer,
} from "@/utils";

const MAX_FORMATTABLE_STATEMENT_SIZE = 10000; // 10K characters

const { t } = useI18n();
const router = useRouter();
const { isCreating, issue, formatOnSave, events, selectedTask } =
  useIssueContext();
const { project } = useCurrentProjectV1();
const { resultMap: checkResultMap, upsertResult: upsertCheckResult } =
  usePlanSQLCheckContext();
const sheetStore = useSheetV1Store();
const loading = ref(false);
const showSQLCheckResultPanel = ref(false);
const sqlCheckConfirmDialog = ref<Defer<boolean>>();

const issueCreateErrorList = computed(() => {
  const errorList: string[] = [];
  if (!hasPermissionToCreateChangeDatabaseIssueInProject(project.value)) {
    errorList.push(t("common.missing-required-permission"));
  }
  if (!issue.value.title.trim()) {
    errorList.push("Missing issue title");
  }
  if (issue.value.rollout) {
    if (
      !issue.value.rolloutEntity?.stages.every((stage) => isValidStage(stage))
    ) {
      errorList.push("Missing SQL statement in some stages");
    }
  } else {
    if (issue.value.planEntity) {
      if (!issue.value.planEntity.specs.every((spec) => isValidSpec(spec))) {
        errorList.push("Missing SQL statement in some specs");
      }
    }
  }
  if (
    project.value.forceIssueLabels &&
    getValidIssueLabels(issue.value.labels, project.value.issueLabels)
      .length === 0
  ) {
    errorList.push(
      t("project.settings.issue-related.labels.force-issue-labels.warning")
    );
  }
  return errorList;
});

const doCreateIssue = async () => {
  loading.value = true;
  // Run SQL check for issue creation.
  if (!(await runSQLCheckForIssue())) {
    loading.value = false;
    return;
  }

  try {
    await createSheets();
    const createdPlan = await createPlan();
    if (!createdPlan) return;

    issue.value.plan = createdPlan.name;
    issue.value.planEntity = createdPlan;

    const issueCreate = {
      ...Issue.fromPartial(issue.value),
      rollout: "",
    };
    const createdIssue = await issueServiceClient.createIssue({
      parent: issue.value.project,
      issue: issueCreate,
    });

    await rolloutServiceClient.createRollout({
      parent: issue.value.project,
      rollout: {
        plan: createdPlan.name,
      },
    });

    emitIssueCreateWindowEvent(createdIssue);
    router.replace({
      name: PROJECT_V1_ROUTE_ISSUE_DETAIL,
      params: {
        projectId: extractProjectResourceName(issue.value.project),
        issueSlug: issueV1Slug(createdIssue.name, createdIssue.title),
      },
    });
  } catch {
    loading.value = false;
  }
};

// Create sheets for spec configs and update their resource names.
const createSheets = async () => {
  const configWithSheetList: (
    | Plan_ChangeDatabaseConfig
    | Plan_ExportDataConfig
  )[] = [];
  const pendingCreateSheetMap = new Map<string, Sheet>();

  const specList = issue.value.planEntity?.specs ?? [];
  for (const spec of specList) {
    const config = spec.changeDatabaseConfig || spec.exportDataConfig;
    if (!config) continue;
    configWithSheetList.push(config);
    if (pendingCreateSheetMap.has(config.sheet)) continue;
    const uid = extractSheetUID(config.sheet);
    if (uid.startsWith("-")) {
      // The sheet is pending create
      const sheet = getLocalSheetByName(config.sheet);
      const engine = await databaseEngineForSpec(spec);
      sheet.engine = engine;
      pendingCreateSheetMap.set(sheet.name, sheet);
      await maybeFormatSQL(sheet, engine);
    }
  }
  const pendingCreateSheetList = Array.from(pendingCreateSheetMap.values());
  const sheetNameMap = new Map<string, string>();
  for (let i = 0; i < pendingCreateSheetList.length; i++) {
    const sheet = pendingCreateSheetList[i];
    sheet.title = issue.value.title;
    const createdSheet = await sheetStore.createSheet(
      issue.value.project,
      sheet
    );
    sheetNameMap.set(sheet.name, createdSheet.name);
  }
  configWithSheetList.forEach((config) => {
    const uid = extractSheetUID(config.sheet);
    if (uid.startsWith("-")) {
      config.sheet = sheetNameMap.get(config.sheet) ?? "";
    }
  });
};

const createPlan = async () => {
  const plan = issue.value.planEntity;
  if (!plan) return;
  const createdPlan = await planServiceClient.createPlan({
    parent: issue.value.project,
    plan,
  });
  return createdPlan;
};

const maybeFormatSQL = async (sheet: Sheet, engine: Engine) => {
  if (!formatOnSave.value) {
    return;
  }
  const language = languageOfEngineV1(engine);
  if (language !== "sql") {
    return;
  }
  const dialect = dialectOfEngineV1(engine);

  const statement = getSheetStatement(sheet);
  if (statement.length > MAX_FORMATTABLE_STATEMENT_SIZE) {
    return;
  }
  const { error, data: formatted } = await formatSQL(statement, dialect);
  if (error) {
    return;
  }

  setSheetStatement(sheet, formatted);
};

const emitIssueCreateWindowEvent = (issue: Issue) => {
  const eventParams = {
    uid: extractIssueUID(issue.name),
    name: issue.name,
    description: issue.description,
  };
  emitWindowEvent("bb.issue-create", eventParams);
};

const runSQLCheckForIssue = async () => {
  if (
    !isCreating.value ||
    ![Issue_Type.DATABASE_CHANGE, Issue_Type.DATABASE_EXPORT].includes(
      issue.value.type
    )
  ) {
    return;
  }

  const flattenTasks = flattenTaskV1List(issue.value.rolloutEntity);
  const statementTargetsMap = new Map<string, string[]>();
  for (const task of flattenTasks) {
    const sheetName = sheetNameOfTaskV1(task);
    let sheet: Sheet | undefined;
    if (extractSheetUID(sheetName).startsWith("-")) {
      sheet = getLocalSheetByName(sheetName);
    } else {
      sheet = await sheetStore.getOrFetchSheetByName(sheetName);
    }
    if (!sheet) continue;
    const statement = getSheetStatement(sheet);
    const database = databaseForTask(project.value, task);
    if (!statement) {
      continue;
    }
    if (statement.length > STATEMENT_SKIP_CHECK_THRESHOLD) {
      continue;
    }
    statementTargetsMap.set(
      statement,
      statementTargetsMap.get(statement)?.concat(database.name) ?? [
        database.name,
      ]
    );
  }
  for (const [statement, targets] of statementTargetsMap.entries()) {
    const result = await releaseServiceClient.checkRelease({
      parent: issue.value.project,
      release: {
        files: [
          {
            // Use "0" for dummy version.
            version: "0",
            type: ReleaseFileType.VERSIONED,
            statement: new TextEncoder().encode(statement),
            changeType: getSpecChangeType(
              specForTask(issue.value.planEntity, selectedTask.value)
            ),
          },
        ],
      },
      targets: targets,
    });
    // Upsert check result for each target.
    for (const r of result?.results || []) {
      upsertCheckResult(r.target, r);
    }
  }

  for (const checkResult of Object.values(checkResultMap.value)) {
    const hasErrors = checkResult.advices.some((advice) => {
      return advice.status === Advice_Status.ERROR;
    });
    // Focus on the first task with error.
    if (hasErrors) {
      loading.value = false;
      const task = flattenTaskV1List(issue.value.rolloutEntity).find((t) => {
        return t.target === checkResult.target;
      });
      if (task) {
        events.emit("select-task", { task });
        const d = defer<boolean>();
        sqlCheckConfirmDialog.value = d;
        d.promise.finally(() => {
          sqlCheckConfirmDialog.value = undefined;
          showSQLCheckResultPanel.value = false;
        });
        showSQLCheckResultPanel.value = true;
        return await d.promise;
      }
      return false;
    }
  }

  return true;
};
</script>
