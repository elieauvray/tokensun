<template>
  <div class="console-layout">
    <div v-if="isBootLoading" class="loading-container" :style="{ minHeight: `${ignitionHeight}px` }">
      <div class="loading-content">
        <ProgressSpinner style="width: 60px; height: 60px" strokeWidth="4" fill="transparent" animationDuration="1s" />
      </div>
    </div>
    <template v-else>
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
    </template>
  </div>
</template>

<script setup lang="ts">
import { getCurrentInstance, onMounted, onUnmounted, ref } from 'vue';
import ProgressSpinner from 'primevue/progressspinner';
import { api } from './components/api';
import { postPreloadIframeHeight } from './plugin/iframeResize';

const hasConnections = ref(true);
const isBootLoading = ref(true);
const ignitionHeight = 5200;
const app = getCurrentInstance()?.appContext.app;
if (app) {
  app.config.globalProperties.toast_duration = 5000;
}

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
  postPreloadIframeHeight(5200);
  window.setTimeout(() => {
    isBootLoading.value = false;
  }, 1600);
  window.addEventListener('tokensun:connections-changed', onConnectionsChanged);
  await refreshConnectionState();
});

onUnmounted(() => {
  window.removeEventListener('tokensun:connections-changed', onConnectionsChanged);
});
</script>
