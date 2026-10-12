function getPageSnapshot() {
  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 &&
      style.display !== 'none' && style.visibility !== 'hidden' &&
      Number(style.opacity || 1) > 0;
  }
  function closeVisiblePopup() {
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [aria-modal="true"]')).filter(isVisible);
    const roots = dialogs.length ? dialogs : [document];
    for (const root of roots) {
      const buttons = root.querySelectorAll('[aria-label="Close"], [aria-label="close"], button');
      for (const button of buttons) {
        if (isVisible(button) && /^(close|đóng|dismiss)$/i.test(button.getAttribute('aria-label') || '')) {
          button.click();
          return true;
        }
      }
    }
    return false;
  }

  const closedPopup = closeVisiblePopup();
  const links = new Map();
  for (const anchor of document.querySelectorAll('a[href]')) {
    try {
      const href = anchor.getAttribute('href') || '';
      const match = href.match(/\\/reel\\/(\\d+)/i);
      if (match) links.set(match[1], 'https://www.facebook.com/reel/' + match[1] + '/');
    } catch { /* Ignore malformed anchors. */ }
  }

  return {
    links: Array.from(links.entries()),
    pageState: /\\/checkpoint\\//i.test(location.pathname) ? 'checkpoint' : /\\/login(?:\\/|$)/i.test(location.pathname) ? 'login_required' : 'loaded',
    finalUrl: location.href,
    title: document.title,
    bodyText: (document.body?.innerText || '').slice(0, 500),
    scrollY: window.scrollY,
    scrollHeight: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0),
    clientHeight: window.innerHeight,
    closedPopup,
  };
}

function scrollPage() {
  const before = window.scrollY;
  window.scrollBy({ top: 1200, behavior: 'smooth' });
  window.dispatchEvent(new WheelEvent('wheel', { deltaY: 1200 }));
  return { target: 'window', before, after: window.scrollY };
}

export async function scrapePage(page) {
  const seen = new Map();
  const debugLogs = [];
  function log(msg, meta = {}) { debugLogs.push({ time: new Date().toISOString(), msg, meta }); }
  function mergeLinks(snapshot) {
    for (const [id, url] of snapshot.links || []) if (!seen.has(id)) seen.set(id, url);
    return seen.size;
  }

  let snapshot = await page.evaluate(getPageSnapshot);
  mergeLinks(snapshot);
  log('Initial scan complete', {
    count: seen.size, scrollHeight: snapshot.scrollHeight,
    scrollY: snapshot.scrollY, clientHeight: snapshot.clientHeight,
    pageState: snapshot.pageState, title: snapshot.title,
    bodyText: snapshot.bodyText, finalUrl: snapshot.finalUrl,
  });

  let idleSteps = 0;
  let previousCount = seen.size;
  const maxSteps = 30;
  const idleLimit = 5;

  for (let step = 1; step <= maxSteps && idleSteps < idleLimit; step++) {
    const scrollAction = await page.evaluate(scrollPage);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    snapshot = await page.evaluate(getPageSnapshot);
    const count = mergeLinks(snapshot);
    const added = count - previousCount;
    idleSteps = added > 0 ? 0 : idleSteps + 1;

    log('Scroll scan', {
      step, count, added, scrollAction,
      scrollHeight: snapshot.scrollHeight, scrollY: snapshot.scrollY,
      idleSteps, closedPopup: snapshot.closedPopup,
      pageState: snapshot.pageState, title: snapshot.title,
      bodyText: snapshot.bodyText, finalUrl: snapshot.finalUrl,
    });
    previousCount = count;
  }

  return {
    links: Array.from(seen.values()), debugLogs,
    status: idleSteps >= idleLimit ? 'stopped_idle_limit' : 'stopped_after_max_steps',
    pageState: snapshot.pageState, finalUrl: snapshot.finalUrl,
  };
}
