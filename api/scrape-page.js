function inspectPage() {
  function visible(element) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 &&
      style.display !== 'none' && style.visibility !== 'hidden' &&
      Number(style.opacity || 1) > 0;
  }

  let closedPopup = false;
  const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [aria-modal="true"]')).filter(visible);
  for (const dialog of dialogs) {
    const button = dialog.querySelector(
      '[aria-label="Close"], [aria-label="close"], [aria-label="Đóng"], [data-testid="close-button"]'
    );
    if (button && visible(button)) {
      button.click();
      closedPopup = true;
      break;
    }
  }

  const links = new Map();
  for (const anchor of document.querySelectorAll('a[href]')) {
    try {
      const url = new URL(anchor.href, location.href);
      if (!/(^|\.)facebook\.com$/i.test(url.hostname)) continue;
      const match = url.pathname.match(/\/reel\/([0-9]+)/i);
      if (match && !links.has(match[1])) {
        links.set(match[1], `https://www.facebook.com/reel/${match[1]}/`);
      }
    } catch {
      // Ignore malformed anchors.
    }
  }

  return {
    links: Array.from(links.entries()),
    pageState: /\/checkpoint\//i.test(location.pathname)
      ? 'checkpoint'
      : /\/login(?:\/|$)/i.test(location.pathname)
        ? 'login_required'
        : 'loaded',
    finalUrl: location.href,
    scrollHeight: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0),
    scrollY: window.scrollY,
    clientHeight: window.innerHeight,
    closedPopup,
  };
}

export async function scrapePage(page) {
  const seen = new Map();
  const debugLogs = [];

  function log(msg, meta = {}) {
    debugLogs.push({ time: new Date().toISOString(), msg, meta });
  }

  function mergeLinks(pageSnapshot) {
    for (const [id, url] of pageSnapshot.links || []) {
      if (!seen.has(id)) seen.set(id, url);
    }
    return seen.size;
  }

  let snapshot = await page.evaluate(inspectPage);
  mergeLinks(snapshot);
  log('Initial scan complete', {
    count: seen.size,
    scrollHeight: snapshot.scrollHeight,
    scrollY: snapshot.scrollY,
    pageState: snapshot.pageState,
  });

  let idleSteps = 0;
  let previousCount = seen.size;
  let previousHeight = snapshot.scrollHeight;
  const maxSteps = 20;
  const idleLimit = 12;

  for (let step = 1; step <= maxSteps && idleSteps < idleLimit; step++) {
    const y = Math.max(100, Math.floor(snapshot.clientHeight * 0.5));
    await page.mouse.move(Math.floor(1280 / 2), y);
    await page.mouse.wheel({ deltaY: Math.max(600, Math.floor(snapshot.clientHeight * 0.8)) });
    await new Promise((resolve) => setTimeout(resolve, 1600));

    snapshot = await page.evaluate(inspectPage);
    const count = mergeLinks(snapshot);
    const added = count - previousCount;
    const heightChanged = snapshot.scrollHeight !== previousHeight;
    idleSteps = added > 0 || heightChanged || snapshot.closedPopup ? 0 : idleSteps + 1;

    log('Scroll scan', {
      step,
      count,
      added,
      scrollHeight: snapshot.scrollHeight,
      scrollY: snapshot.scrollY,
      idleSteps,
      closedPopup: snapshot.closedPopup,
      pageState: snapshot.pageState,
    });

    previousCount = count;
    previousHeight = snapshot.scrollHeight;
  }

  return {
    links: Array.from(seen.values()),
    debugLogs,
    status: idleSteps >= idleLimit ? 'stopped_idle_limit' : 'stopped_after_scrolling',
    pageState: snapshot.pageState,
    finalUrl: snapshot.finalUrl,
  };
}
