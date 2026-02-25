import { createRouter, createWebHistory } from 'vue-router';
import ConnectionsView from '../views/ConnectionsView.vue';
import ProvisionView from '../views/ProvisionView.vue';
import DashboardView from '../views/DashboardView.vue';

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/connections' },
    { path: '/connections', component: ConnectionsView },
    { path: '/provision', component: ProvisionView },
    { path: '/dashboard', component: DashboardView }
  ]
});
