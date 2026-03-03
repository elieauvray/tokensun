<template>
  <div>
    <div v-if="isLoading" class="loading-container">
      <div class="loading-content">
        <ProgressSpinner style="width: 60px; height: 60px" strokeWidth="4" fill="transparent" animationDuration="1s" />
        <p class="loading-text">Loading credentials...</p>
      </div>
    </div>
    <div v-else class="console-layout">
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
  </div>
</template>

<script setup lang="ts">
import { getCurrentInstance, onMounted, onUnmounted, ref } from 'vue';
import { getPluginSDK } from 'pluginapp-sdk-node';
import ProgressSpinner from 'primevue/progressspinner';
import { api } from './components/api';

const hasConnections = ref(true);
const isLoading = ref(true);
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
  window.setTimeout(() => {
    isLoading.value = false;
  }, 800);
});

onUnmounted(() => {
  if (pluginSDK) {
    pluginSDK.destroy();
  }
  window.removeEventListener('tokensun:connections-changed', onConnectionsChanged);
});
</script>
