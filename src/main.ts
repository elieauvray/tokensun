import { createApp } from 'vue';
import PrimeVue from 'primevue/config';
import App from './App.vue';
import router from './router';
import { initIframeAutoResize, postPreloadIframeHeight } from './plugin/iframeResize';

import 'primevue/resources/themes/lara-light-blue/theme.css';
import 'primevue/resources/primevue.min.css';
import 'primeicons/primeicons.css';
import './styles.css';

const mountTarget = (
  document.evaluate("//div[text()='Loading...']", document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue as Element | null
) ?? document.getElementById('app');
if (!mountTarget) {
  throw new Error('Failed to resolve app mount target');
}

const appRoot = document.getElementById('app');
if (appRoot) {
  appRoot.textContent = 'text';
  appRoot.classList.add('iframe-preload-debug');
}

postPreloadIframeHeight();

window.setTimeout(() => {
  const app = createApp(App);
  app.use(router);
  app.use(PrimeVue);
  app.mount(mountTarget);
  initIframeAutoResize(router);
  appRoot?.classList.remove('iframe-preload-debug');
}, 800);
