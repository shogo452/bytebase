import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { errorDetailsClientMiddleware } from "nice-grpc-error-details";
import {
  createChannel,
  createClientFactory,
  FetchTransport,
  WebsocketTransport,
} from "nice-grpc-web";
import { ActuatorService } from "@/types/proto-es/v1/actuator_service_pb";
import { AuditLogService } from "@/types/proto-es/v1/audit_log_service_pb";
import { AuthService } from "@/types/proto-es/v1/auth_service_pb";
import { CelService } from "@/types/proto-es/v1/cel_service_pb";
import { DatabaseCatalogService } from "@/types/proto-es/v1/database_catalog_service_pb";
import { InstanceRoleService } from "@/types/proto-es/v1/instance_role_service_pb";
import { SettingService } from "@/types/proto-es/v1/setting_service_pb";
import { SubscriptionService } from "@/types/proto-es/v1/subscription_service_pb";
import { WorkspaceService } from "@/types/proto-es/v1/workspace_service_pb";
import { ChangelistServiceDefinition } from "@/types/proto/v1/changelist_service";
import { DatabaseGroupServiceDefinition } from "@/types/proto/v1/database_group_service";
import { DatabaseServiceDefinition } from "@/types/proto/v1/database_service";
import { GroupServiceDefinition } from "@/types/proto/v1/group_service";
import { IdentityProviderServiceDefinition } from "@/types/proto/v1/idp_service";
import { InstanceServiceDefinition } from "@/types/proto/v1/instance_service";
import { IssueServiceDefinition } from "@/types/proto/v1/issue_service";
import { OrgPolicyServiceDefinition } from "@/types/proto/v1/org_policy_service";
import { PlanServiceDefinition } from "@/types/proto/v1/plan_service";
import { ProjectServiceDefinition } from "@/types/proto/v1/project_service";
import { ReleaseServiceDefinition } from "@/types/proto/v1/release_service";
import { ReviewConfigServiceDefinition } from "@/types/proto/v1/review_config_service";
import { RevisionServiceDefinition } from "@/types/proto/v1/revision_service";
import { RiskServiceDefinition } from "@/types/proto/v1/risk_service";
import { RoleServiceDefinition } from "@/types/proto/v1/role_service";
import { RolloutServiceDefinition } from "@/types/proto/v1/rollout_service";
import { SheetServiceDefinition } from "@/types/proto/v1/sheet_service";
import { SQLServiceDefinition } from "@/types/proto/v1/sql_service";
import { UserServiceDefinition } from "@/types/proto/v1/user_service";
import { WorksheetServiceDefinition } from "@/types/proto/v1/worksheet_service";
import {
  authInterceptorMiddleware,
  authInterceptor,
  errorNotificationInterceptor,
  errorNotificationMiddleware,
  simulateLatencyMiddleware,
} from "./middlewares";

// Create each grpc service client.
// Reference: https://github.com/deeplay-io/nice-grpc/blob/master/packages/nice-grpc-web/README.md

const address = import.meta.env.BB_GRPC_LOCAL || window.location.origin;

const channel = createChannel(
  address,
  FetchTransport({
    credentials: "include",
  })
);
const websocketChannel = createChannel(
  window.location.origin,
  WebsocketTransport()
);

const clientFactory = createClientFactory()
  // A middleware that is attached first, will be invoked last.
  .use(authInterceptorMiddleware)
  .use(errorDetailsClientMiddleware)
  .use(errorNotificationMiddleware)
  .use(simulateLatencyMiddleware);
/**
 * Example to use error notification middleware.
 * Errors occurs during all requests will cause UI notifications automatically.
 * abcServiceClient.foo(requestParams, {
 *   // true if you want to suppress error notifications for this call
 *   silent: true,
 * })
 */

export const userServiceClient = clientFactory.create(
  UserServiceDefinition,
  channel
);

export const roleServiceClient = clientFactory.create(
  RoleServiceDefinition,
  channel
);

export const instanceServiceClient = clientFactory.create(
  InstanceServiceDefinition,
  channel
);

export const policyServiceClient = clientFactory.create(
  OrgPolicyServiceDefinition,
  channel
);

export const projectServiceClient = clientFactory.create(
  ProjectServiceDefinition,
  channel
);

export const databaseServiceClient = clientFactory.create(
  DatabaseServiceDefinition,
  channel
);


export const databaseGroupServiceClient = clientFactory.create(
  DatabaseGroupServiceDefinition,
  channel
);

export const identityProviderClient = clientFactory.create(
  IdentityProviderServiceDefinition,
  channel
);

export const riskServiceClient = clientFactory.create(
  RiskServiceDefinition,
  channel
);

export const sheetServiceClient = clientFactory.create(
  SheetServiceDefinition,
  channel
);

export const worksheetServiceClient = clientFactory.create(
  WorksheetServiceDefinition,
  channel
);

export const issueServiceClient = clientFactory.create(
  IssueServiceDefinition,
  channel
);

export const rolloutServiceClient = clientFactory.create(
  RolloutServiceDefinition,
  channel
);

export const planServiceClient = clientFactory.create(
  PlanServiceDefinition,
  channel
);

export const sqlServiceClient = clientFactory.create(
  SQLServiceDefinition,
  channel
);

export const sqlStreamingServiceClient = clientFactory.create(
  SQLServiceDefinition,
  websocketChannel
);

export const changelistServiceClient = clientFactory.create(
  ChangelistServiceDefinition,
  channel
);


export const groupServiceClient = clientFactory.create(
  GroupServiceDefinition,
  channel
);

export const reviewConfigServiceClient = clientFactory.create(
  ReviewConfigServiceDefinition,
  channel
);

export const releaseServiceClient = clientFactory.create(
  ReleaseServiceDefinition,
  channel
);

export const revisionServiceClient = clientFactory.create(
  RevisionServiceDefinition,
  channel
);


// e.g. How to use `authServiceClient`?
//
// await authServiceClient.login({
//   email: "bb@bytebase.com",
//   password: "bb",
//   web: true,
// });
// const { users } = await authServiceClient.listUsers({});

const transport = createConnectTransport({
  baseUrl: address,
  useBinaryFormat: true,
  interceptors: [authInterceptor, errorNotificationInterceptor],
  fetch: (input, init) => fetch(input, { ...init, credentials: "include" }),
});

export const actuatorServiceClientConnect = createClient(
  ActuatorService,
  transport
);

export const authServiceClientConnect = createClient(AuthService, transport);

export const auditLogServiceClientConnect = createClient(
  AuditLogService,
  transport
);

export const subscriptionServiceClientConnect = createClient(
  SubscriptionService,
  transport
);

export const workspaceServiceClientConnect = createClient(
  WorkspaceService,
  transport
);

export const settingServiceClientConnect = createClient(
  SettingService,
  transport
);

export const celServiceClientConnect = createClient(CelService, transport);

export const databaseCatalogServiceClientConnect = createClient(
  DatabaseCatalogService,
  transport
);

export const instanceRoleServiceClientConnect = createClient(
  InstanceRoleService,
  transport
);
