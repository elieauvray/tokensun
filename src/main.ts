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
  appRoot.innerHTML = '<div id="iframe-preload-debug-label">text</div>';
  appRoot.classList.add('iframe-preload-debug');
}

const preloadSteps = [900, 1300, 1700, 2100, 2400];
const debugLabel = document.getElementById('iframe-preload-debug-label');
const maxTravel = Math.min(window.innerHeight * 0.7, 700);

preloadSteps.forEach((height, index) => {
  window.setTimeout(() => {
    postPreloadIframeHeight(height);
    if (debugLabel) {
      const progress = (index + 1) / preloadSteps.length;
      debugLabel.style.transform = `translateY(${Math.round(progress * maxTravel)}px)`;
    }
  }, index * 320);
});

window.setTimeout(() => {
  const app = createApp(App);
  app.use(router);
  app.use(PrimeVue);
  app.mount(mountTarget);
  initIframeAutoResize(router);
  appRoot?.classList.remove('iframe-preload-debug');
}, 2500);
