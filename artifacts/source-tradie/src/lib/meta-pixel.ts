// Meta Pixel loader for the existing SourceTradie dataset. Do not point
// this at a different Pixel/Dataset ID — Meta Ads Manager reporting and
// the Leads campaign are wired to this exact dataset.
const META_PIXEL_ID = "2618595421695719";

type Fbq = {
  (...args: unknown[]): void;
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][];
  push: Fbq;
  loaded: boolean;
  version: string;
};

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

function loadPixelScript() {
  const fbq = function (...args: unknown[]) {
    if (fbq.callMethod) {
      fbq.callMethod(...args);
    } else {
      fbq.queue.push(args);
    }
  } as Fbq;
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.queue = [];
  window.fbq = fbq;
  if (!window._fbq) window._fbq = fbq;

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  const firstScript = document.getElementsByTagName("script")[0];
  firstScript?.parentNode?.insertBefore(script, firstScript);

  window.fbq("init", META_PIXEL_ID);
}

/**
 * Fires a PageView. The first call loads fbevents.js and initialises the
 * pixel (guarded by `window.fbq` not existing yet), so route changes never
 * re-init or duplicate that setup — they just track another PageView.
 */
export function trackMetaPageView() {
  if (typeof window === "undefined") return;
  if (!window.fbq) {
    loadPixelScript();
  }
  window.fbq?.("track", "PageView");
}

/**
 * Fires a Lead event. Only call this from the confirmed-success path of
 * the partner application flow — never on page load, form start, submit,
 * validation errors, or failed requests.
 */
export function trackMetaLead() {
  if (typeof window === "undefined" || !window.fbq) return;
  window.fbq("track", "Lead");
}
