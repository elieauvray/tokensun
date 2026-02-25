import { createRouter, createWebHistory } from 'vue-router';
import ConnectionsView from '../views/ConnectionsView.vue';

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/connections' },
    {
      path: '/:organizationId/:projectId/:environmentId/',
      redirect: (to) => ({
        path: '/connections',
        query: {
          organizationId: String(to.params.organizationId ?? ''),
          projectId: String(to.params.projectId ?? ''),
          environmentId: String(to.params.environmentId ?? '')
        }
      })
    },
    { path: '/connections', component: ConnectionsView },
    { path: '/provision', redirect: '/connections' },
    { path: '/dashboard', redirect: '/connections' }
  ]
});
