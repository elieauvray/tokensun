<template>
  <section class="console-section">
    <article class="console-panel">
      <header class="console-panel-header">
        <h2 class="console-panel-title">Provision TOKENSUN variables</h2>
        <p class="console-panel-subtitle">Write strict allowlisted `TOKENSUN_*` variables to project or environment level.</p>
      </header>
      <div class="console-panel-body console-grid-3">
        <Dropdown v-model="form.connectionId" :options="connectionOptions" optionLabel="label" optionValue="value" placeholder="Connection" />
        <Dropdown v-model="form.level" :options="levels" placeholder="Level" />
        <InputText v-model="form.environmentId" placeholder="Environment ID (if environment level)" />
        <InputText v-model="form.appScopeRaw" class="span-2" placeholder="App scopes (comma-separated)" />
        <div class="console-row">
          <Checkbox v-model="form.makeDefault" binary inputId="default" />
          <label for="default">Set as default connection</label>
        </div>
        <Button label="Provision" @click="provision" />
      </div>
    </article>

    <p v-if="message" class="console-msg">{{ message }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Dropdown from 'primevue/dropdown';
import Checkbox from 'primevue/checkbox';
import { api } from '../components/api';

const connections = ref<any[]>([]);
const message = ref('');
const levels = ['project', 'environment'];

const form = reactive({
  connectionId: '',
  level: 'project',
  environmentId: '',
  appScopeRaw: '',
  makeDefault: true
});

const connectionOptions = computed(() =>
  connections.value.map((c) => ({ label: `${c.provider} - ${c.name}`, value: c.id }))
);

async function load() {
  const res = await api<{ connections: any[] }>('/api/connections');
  connections.value = res.connections;
  if (!form.connectionId && res.connections[0]) {
    form.connectionId = res.connections[0].id;
  }
}

async function provision() {
  await api('/api/provision', {
    method: 'POST',
    body: JSON.stringify({
      connectionId: form.connectionId,
      level: form.level,
      environmentId: form.level === 'environment' ? form.environmentId : undefined,
      appScope: form.appScopeRaw
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
      makeDefault: form.makeDefault
    })
  });
  message.value = 'Provisioned TOKENSUN variables';
}

onMounted(load);
</script>

<style scoped>
.span-2 {
  grid-column: span 2;
}

@media (max-width: 980px) {
  .span-2 {
    grid-column: span 1;
  }
}
</style>
