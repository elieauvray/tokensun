import type { Router } from 'vue-router';

const RESIZE_TOPICS = ['PLUGIN_TOPIC_RESIZE_IFRAME', 'PLUGINS_RESIZE_IFRAME'] as const;
const VIEW_LOADED_TOPICS = ['PLUGIN_TOPIC_VIEW_LOADED', 'VIEW_LOADED'] as const;
const MAX_IFRAME_REQUEST_HEIGHT = 100000;
const PRELOAD_IFRAME_HEIGHT = MAX_IFRAME_REQUEST_HEIGHT;
const RESIZE_DEBUG_PREFIX = '[TokenSun iframe-resize]';

type ResizeSource =
  | 'preload'
  | 'init'
  | 'router-after-each'
  | 'resize-observer'
  | 'mutation-observer'
  | 'window-resize'
  | 'window-load'
  | 'orientationchange'
  | 'visibilitychange'
  | 'poll';

function measureContentHeight(): number {
  const body = document.body;
  const html = document.documentElement;
  const app = document.getElementById('app');
  const appHeight = app ? Math.ceil(app.getBoundingClientRect().height) : 0;
  const scrollHeight = Math.max(body?.scrollHeight ?? 0, html?.scrollHeight ?? 0, appHeight);
  return Math.max(scrollHeight, window.innerHeight);
}

function nowIso(): string {
  return new Date().toISOString();
}

function debugLogResize(action: string, height: number, source: ResizeSource): void {
  // Visible in browser console to identify exactly which code path emits each resize.
  console.info(`${RESIZE_DEBUG_PREFIX} ${nowIso()}`, { source, action, height });
}

function postResize(height: number, source: ResizeSource): void {
  const target = Math.max(MAX_IFRAME_REQUEST_HEIGHT, Math.ceil(height));
  if (target !== height) {
    console.warn(`${RESIZE_DEBUG_PREFIX} ${nowIso()} clamped`, { source, from: height, to: target });
  }

  // Emit both legacy and current actions for host compatibility and trace each payload.
  for (const action of RESIZE_TOPICS) {
    debugLogResize(action, target, source);
    window.parent?.postMessage({ action, data: target }, '*');
  }
}

function postViewLoaded(source: ResizeSource): void {
  for (const action of VIEW_LOADED_TOPICS) {
    console.info(`${RESIZE_DEBUG_PREFIX} ${nowIso()}`, { source, action, data: true });
    window.parent?.postMessage({ action, data: true }, '*');
  }
}

export function postPreloadIframeHeight(height = PRELOAD_IFRAME_HEIGHT): void {
  postResize(height, 'preload');
  postViewLoaded('preload');
  window.setTimeout(() => postResize(height, 'preload'), 0);
  window.setTimeout(() => postResize(height, 'preload'), 80);
  window.setTimeout(() => postResize(height, 'preload'), 260);
}

export function initIframeAutoResize(router: Router): void {
  let lastPostedHeight = 0;
  let raf = 0;
  let pollTimer = 0;

  let scheduledSource: ResizeSource = 'init';

  const flush = () => {
    raf = 0;
    const measured = measureContentHeight();
    const target = Math.max(MAX_IFRAME_REQUEST_HEIGHT, measured);
    if (Math.abs(target - lastPostedHeight) > 1) {
      lastPostedHeight = target;
      postResize(target, scheduledSource);
    }
  };

  const schedule = (source: ResizeSource) => {
    scheduledSource = source;
    if (raf) return;
    raf = window.requestAnimationFrame(flush);
  };

  const resizeObserver = new ResizeObserver(() => schedule('resize-observer'));
  resizeObserver.observe(document.documentElement);
  resizeObserver.observe(document.body);

  const mutationObserver = new MutationObserver(() => schedule('mutation-observer'));
  mutationObserver.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });

  window.addEventListener('resize', () => schedule('window-resize'), { passive: true });
  window.addEventListener('load', () => schedule('window-load'));
  window.addEventListener('orientationchange', () => schedule('orientationchange'), { passive: true });

  router.afterEach(() => {
    postViewLoaded('router-after-each');
    schedule('router-after-each');
    window.setTimeout(() => schedule('router-after-each'), 80);
    window.setTimeout(() => schedule('router-after-each'), 260);
  });

  document.addEventListener('visibilitychange', () => schedule('visibilitychange'));

  // Initial kicks for async UI hydration and chart/layout calculations.
  postViewLoaded('init');
  schedule('init');
  window.setTimeout(() => schedule('init'), 0);
  window.setTimeout(() => schedule('init'), 80);
  window.setTimeout(() => schedule('init'), 260);
  window.setTimeout(() => schedule('init'), 600);
  window.setTimeout(() => schedule('init'), 1200);
  window.setTimeout(() => postViewLoaded('init'), 80);
  window.setTimeout(() => postViewLoaded('init'), 260);
  window.setTimeout(() => postViewLoaded('init'), 600);

  // Safety net for host resizing race conditions on tab switches.
  pollTimer = window.setInterval(() => schedule('poll'), 400);
  window.setTimeout(() => {
    window.clearInterval(pollTimer);
    pollTimer = 0;
  }, 20000);
}
