import type { Router } from 'vue-router';

const RESIZE_TOPICS = ['PLUGIN_TOPIC_RESIZE_IFRAME', 'PLUGINS_RESIZE_IFRAME'] as const;
const VIEW_LOADED_TOPICS = ['PLUGIN_TOPIC_VIEW_LOADED', 'VIEW_LOADED'] as const;
const MIN_IFRAME_HEIGHT = 3200;
const PRELOAD_IFRAME_HEIGHT = 4200;

function measureContentHeight(): number {
  const body = document.body;
  const html = document.documentElement;
  const app = document.getElementById('app');
  const appHeight = app ? Math.ceil(app.getBoundingClientRect().height) : 0;
  const scrollHeight = Math.max(body?.scrollHeight ?? 0, html?.scrollHeight ?? 0, appHeight);
  return Math.max(scrollHeight, window.innerHeight);
}

function postResize(height: number): void {
  for (const topic of RESIZE_TOPICS) {
    const payloads: unknown[] = [
      { action: topic, data: height },
      { action: topic, data: { height } },
      { topic, data: { height } },
      { type: topic, data: { height } },
      { topic, height },
      { type: topic, height },
      { topic, payload: { height } },
      { type: topic, payload: { height } },
      { topic, value: { height } },
      { type: topic, value: { height } }
    ];
    for (const payload of payloads) {
      window.parent?.postMessage(payload, '*');
    }
  }
}

function postViewLoaded(): void {
  for (const topic of VIEW_LOADED_TOPICS) {
    const payloads: unknown[] = [
      { action: topic, data: true },
      { action: topic, data: {} },
      { topic },
      { type: topic },
      { topic, data: {} },
      { type: topic, data: {} }
    ];
    for (const payload of payloads) {
      window.parent?.postMessage(payload, '*');
    }
  }
}

export function postPreloadIframeHeight(height = PRELOAD_IFRAME_HEIGHT): void {
  postResize(height);
  postViewLoaded();
  window.setTimeout(() => postResize(height), 0);
  window.setTimeout(() => postResize(height), 80);
  window.setTimeout(() => postResize(height), 260);
}

export function initIframeAutoResize(router: Router): void {
  let lastPostedHeight = 0;
  let raf = 0;
  let pollTimer = 0;

  const flush = () => {
    raf = 0;
    const measured = measureContentHeight();
    const target = Math.max(MIN_IFRAME_HEIGHT, measured);
    if (Math.abs(target - lastPostedHeight) > 1) {
      lastPostedHeight = target;
      postResize(target);
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

  document.addEventListener('visibilitychange', schedule);

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

  // Safety net for host resizing race conditions on tab switches.
  pollTimer = window.setInterval(schedule, 400);
  window.setTimeout(() => {
    window.clearInterval(pollTimer);
    pollTimer = 0;
  }, 20000);
}
