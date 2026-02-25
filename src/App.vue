<template>
  <div class="console-layout">
    <header class="console-header">
      <div class="console-title">
        <span class="console-title-dot"></span>
        <span>TokenSun</span>
      </div>
      <nav class="console-nav">
        <RouterLink to="/connections">Connections</RouterLink>
      </nav>
    </header>
    <main class="console-main">
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts"></script>
