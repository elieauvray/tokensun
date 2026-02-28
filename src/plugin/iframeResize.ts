import type { Router } from 'vue-router';

const RESIZE_TOPIC = 'PLUGIN_TOPIC_RESIZE_IFRAME';

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
    { type: RESIZE_TOPIC, height }
  ];
  for (const payload of payloads) {
    window.parent?.postMessage(payload, '*');
  }
}

export function initIframeAutoResize(router: Router): void {
  let lastHeight = 0;
  let raf = 0;

  const flush = () => {
    raf = 0;
    const next = measureContentHeight();
    if (next !== lastHeight) {
      lastHeight = next;
      postResize(next);
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
    schedule();
    window.setTimeout(schedule, 80);
    window.setTimeout(schedule, 260);
  });

  // Initial kicks for async UI hydration and chart/layout calculations.
  schedule();
  window.setTimeout(schedule, 0);
  window.setTimeout(schedule, 80);
  window.setTimeout(schedule, 260);
  window.setTimeout(schedule, 600);
  window.setTimeout(schedule, 1200);
}
