<template>
  <div class="console-layout">
    <header class="console-header">
      <div class="console-title">
        <span class="console-title-dot"></span>
        <span>TokenSun</span>
      </div>
      <nav class="console-nav">
        <RouterLink to="/connections" :class="{ 'console-nav-attention': !hasConnections }">Connections</RouterLink>
        <RouterLink to="/dashboard">Dashboard</RouterLink>
      </nav>
    </header>
    <main class="console-main">
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
import { getCurrentInstance, onMounted, onUnmounted, ref } from 'vue';
import { getPluginSDK } from 'pluginapp-sdk-node';
import { api } from './components/api';

const hasConnections = ref(true);
const app = getCurrentInstance()?.appContext.app;
if (app) {
  app.config.globalProperties.toast_duration = 5000;
}
let pluginSDK: ReturnType<typeof getPluginSDK> | null = null;

async function refreshConnectionState() {
  try {
    const res = await api<{ connections: any[] }>('/api/connections');
    hasConnections.value = Array.isArray(res.connections) && res.connections.length > 0;
  } catch {
    hasConnections.value = true;
  }
}

async function onConnectionsChanged() {
  await refreshConnectionState();
}

onMounted(async () => {
  pluginSDK = getPluginSDK();
  window.addEventListener('tokensun:connections-changed', onConnectionsChanged);
  await refreshConnectionState();
});

onUnmounted(() => {
  if (pluginSDK) {
    pluginSDK.destroy();
  }
  window.removeEventListener('tokensun:connections-changed', onConnectionsChanged);
});
</script>
