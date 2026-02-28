import { createRouter, createWebHistory } from 'vue-router';
import ConnectionsView from '../views/ConnectionsView.vue';
import DashboardView from '../views/DashboardView.vue';

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/dashboard' },
    {
      path: '/:organizationId/:projectId/:environmentId/',
      redirect: (to) => ({
        path: '/dashboard',
        query: {
          organizationId: String(to.params.organizationId ?? ''),
          projectId: String(to.params.projectId ?? ''),
          environmentId: String(to.params.environmentId ?? '')
        }
      })
    },
    { path: '/connections', component: ConnectionsView },
    { path: '/provision', redirect: '/connections' },
    { path: '/dashboard', component: DashboardView }
  ]
});
