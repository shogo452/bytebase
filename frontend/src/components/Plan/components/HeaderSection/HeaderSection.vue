<template>
  <div
    class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-2 px-4"
  >
    <TitleInput />
    <div class="flex flex-row items-center justify-end">
      <Actions />
    </div>
  </div>
</template>

<script lang="ts" setup>
import Actions from "./Actions";
import TitleInput from "./TitleInput.vue";
</script>
