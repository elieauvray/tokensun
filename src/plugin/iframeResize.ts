import type { Router } from 'vue-router';

const RESIZE_TOPIC = 'PLUGIN_TOPIC_RESIZE_IFRAME';
const VIEW_LOADED_TOPIC = 'PLUGIN_TOPIC_VIEW_LOADED';
const MAX_HEIGHT_SESSION_KEY = 'tokensun.iframe.maxHeight';
const MIN_IFRAME_HEIGHT = 8200;

function measureContentHeight(): number {
  const body = document.body;
  const html = document.documentElement;
  const app = document.getElementById('app');
  const appHeight = app ? Math.ceil(app.getBoundingClientRect().height) : 0;
  const scrollHeight = Math.max(body?.scrollHeight ?? 0, html?.scrollHeight ?? 0, appHeight);
  return Math.max(scrollHeight, window.innerHeight);
}

function postResize(height: number): void {
  const payloads: unknown[] = [
    { topic: RESIZE_TOPIC, data: { height } },
    { type: RESIZE_TOPIC, data: { height } },
    { topic: RESIZE_TOPIC, height },
    { type: RESIZE_TOPIC, height },
    { topic: RESIZE_TOPIC, payload: { height } },
    { type: RESIZE_TOPIC, payload: { height } },
    { topic: RESIZE_TOPIC, value: { height } },
    { type: RESIZE_TOPIC, value: { height } }
  ];
  for (const payload of payloads) {
    window.parent?.postMessage(payload, '*');
  }
}

function postViewLoaded(): void {
  const payloads: unknown[] = [
    { topic: VIEW_LOADED_TOPIC },
    { type: VIEW_LOADED_TOPIC },
    { topic: VIEW_LOADED_TOPIC, data: {} },
    { type: VIEW_LOADED_TOPIC, data: {} }
  ];
  for (const payload of payloads) {
    window.parent?.postMessage(payload, '*');
  }
}

export function initIframeAutoResize(router: Router): void {
  const restoredMax = Number(sessionStorage.getItem(MAX_HEIGHT_SESSION_KEY) || 0);
  let maxHeightSeen = Number.isFinite(restoredMax) ? Math.max(0, restoredMax) : 0;
  let lastPostedHeight = 0;
  let raf = 0;

  const flush = () => {
    raf = 0;
    const measured = measureContentHeight();
    const stableTarget = Math.max(MIN_IFRAME_HEIGHT, measured, maxHeightSeen);
    maxHeightSeen = stableTarget;
    sessionStorage.setItem(MAX_HEIGHT_SESSION_KEY, String(maxHeightSeen));
    if (stableTarget !== lastPostedHeight) {
      lastPostedHeight = stableTarget;
      postResize(stableTarget);
    }
  };

  const schedule = () => {
    if (raf) return;
    raf = window.requestAnimationFrame(flush);
  };

  const resizeObserver = new ResizeObserver(() => schedule());
  resizeObserver.observe(document.documentElement);
  resizeObserver.observe(document.body);

  const mutationObserver = new MutationObserver(() => schedule());
  mutationObserver.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });

  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('load', schedule);
  window.addEventListener('orientationchange', schedule, { passive: true });

  router.afterEach(() => {
    postViewLoaded();
    schedule();
    window.setTimeout(schedule, 80);
    window.setTimeout(schedule, 260);
  });

  // Initial kicks for async UI hydration and chart/layout calculations.
  postViewLoaded();
  schedule();
  window.setTimeout(schedule, 0);
  window.setTimeout(schedule, 80);
  window.setTimeout(schedule, 260);
  window.setTimeout(schedule, 600);
  window.setTimeout(schedule, 1200);
  window.setTimeout(postViewLoaded, 80);
  window.setTimeout(postViewLoaded, 260);
  window.setTimeout(postViewLoaded, 600);
}
