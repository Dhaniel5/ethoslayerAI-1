// Deep-link helpers: open shareable escrow links inside the EthosLayer app
// when it is installed, and quietly stay on the website when it is not.

export const APP_SCHEME = "ethoslayer";

/** Custom-scheme link for an escrow, e.g. ethoslayer://escrow/<id>. */
export function escrowAppLink(id: string) {
  return `${APP_SCHEME}://escrow/${id}`;
}

export function isMobileWeb() {
  if (typeof navigator === "undefined") return false;
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * Try to hand the current page over to the native app.
 * Resolves true when the page was backgrounded (app opened), false otherwise.
 */
export function openInApp(url: string, timeoutMs = 1200): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);

  return new Promise((resolve) => {
    let settled = false;
    const done = (opened: boolean) => {
      if (settled) return;
      settled = true;
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
      resolve(opened);
    };
    const onHide = () => {
      if (document.hidden) done(true);
    };
    const onPageHide = () => done(true);

    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);

    try {
      const frame = document.createElement("iframe");
      frame.style.display = "none";
      frame.src = url;
      document.body.appendChild(frame);
      window.setTimeout(() => frame.remove(), timeoutMs);
      // Safari needs a top-level navigation attempt as well.
      window.location.href = url;
    } catch {
      /* scheme not handled */
    }

    window.setTimeout(() => done(false), timeoutMs);
  });
}

const ATTEMPT_KEY = "ethoslayer.deeplink.attempted";

/** Only auto-attempt the handoff once per escrow per browser session. */
export function shouldAutoOpen(id: string) {
  try {
    const seen = sessionStorage.getItem(ATTEMPT_KEY);
    if (seen === id) return false;
    sessionStorage.setItem(ATTEMPT_KEY, id);
    return true;
  } catch {
    return false;
  }
}
