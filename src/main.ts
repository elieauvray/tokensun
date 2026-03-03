import { createApp } from 'vue';
import PrimeVue from 'primevue/config';
import { getPluginSDK } from 'pluginapp-sdk-node';
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

const ignitionSpacer = document.createElement('div');
ignitionSpacer.id = 'tokensun-ignition-spacer';
ignitionSpacer.style.height = '3600px';
ignitionSpacer.style.pointerEvents = 'none';
document.body.appendChild(ignitionSpacer);

getPluginSDK();
postPreloadIframeHeight(3600);
window.setTimeout(() => ignitionSpacer.remove(), 1000);

const app = createApp(App);
app.use(router);
app.use(PrimeVue);
app.mount(mountTarget);
initIframeAutoResize(router);
