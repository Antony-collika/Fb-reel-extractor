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
    for (const dialog of dialogs) {
      const button = dialog.querySelector('[aria-label="Close"], [aria-label="close"], [aria-label="Đóng"], [data-testid="close-button"]');
      if (button && isVisible(button)) { button.click(); return true; }
    }
    return false;
  }
  function findReelsScroller() {
    const preferred = document.querySelector('#scrollview');
    if (preferred && preferred.scrollHeight > preferred.clientHeight + 100) return preferred;
    const candidates = Array.from(document.querySelectorAll('main, [role="main"], div, section')).filter((element) => {
      const style = getComputedStyle(element);
      return /(auto|scroll)/i.test(style.overflowY) &&
        element.scrollHeight > element.clientHeight + 150 &&
        element.querySelector('a[href*="/reel/"]') !== null;
    });
    candidates.sort((a, b) => {
      const aLinks = a.querySelectorAll('a[href*="/reel/"]').length;
      const bLinks = b.querySelectorAll('a[href*="/reel/"]').length;
      return bLinks - aLinks || b.scrollHeight - a.scrollHeight;
    });
    return candidates[0] || null;
  }

  const closedPopup = closeVisiblePopup();
  const links = new Map();
  for (const anchor of document.querySelectorAll('a[href]')) {
    try {
      const url = new URL(anchor.href, location.href);
      if (!/(^|\.)facebook\.com$/i.test(url.hostname)) continue;
      const match = url.pathname.match(/\/reel\/([0-9]+)/i);
      if (match && !links.has(match[1])) links.set(match[1], 'https://www.facebook.com/reel/' + match[1] + '/');
    } catch { /* Ignore malformed anchors. */ }
  }
  const scroller = findReelsScroller();
  const useWindow = !scroller;
  return {
    links: Array.from(links.entries()),
    pageState: /\/checkpoint\//i.test(location.pathname) ? 'checkpoint' : /\/login(?:\/|$)/i.test(location.pathname) ? 'login_required' : 'loaded',
    finalUrl: location.href,
    title: document.title,
    bodyText: (document.body?.innerText || '').slice(0, 500),
    scroller: useWindow ? 'window' : { tag: scroller.tagName.toLowerCase(), id: scroller.id || '', className: String(scroller.className || '').slice(0, 160) },
    scrollY: useWindow ? window.scrollY : scroller.scrollTop,
    scrollHeight: useWindow ? Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0) : scroller.scrollHeight,
    clientHeight: useWindow ? window.innerHeight : scroller.clientHeight,
    closedPopup,
  };
}

function scrollReelsContainer(amount) {
  function findReelsScroller() {
    const preferred = document.querySelector('#scrollview');
    if (preferred && preferred.scrollHeight > preferred.clientHeight + 100) return preferred;
    const candidates = Array.from(document.querySelectorAll('main, [role="main"], div, section')).filter((element) => {
      const style = getComputedStyle(element);
      return /(auto|scroll)/i.test(style.overflowY) &&
        element.scrollHeight > element.clientHeight + 150 &&
        element.querySelector('a[href*="/reel/"]') !== null;
    });
    candidates.sort((a, b) => {
      const aLinks = a.querySelectorAll('a[href*="/reel/"]').length;
      const bLinks = b.querySelectorAll('a[href*="/reel/"]').length;
      return bLinks - aLinks || b.scrollHeight - a.scrollHeight;
    });
    return candidates[0] || null;
  }
  const scroller = findReelsScroller();
  if (scroller) {
    const before = scroller.scrollTop;
    scroller.scrollTop = Math.min(before + amount, scroller.scrollHeight);
    scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
    scroller.dispatchEvent(new WheelEvent('wheel', { deltaY: amount, bubbles: true, cancelable: true }));
    return { target: scroller.id || scroller.tagName.toLowerCase(), before, after: scroller.scrollTop, scrollHeight: scroller.scrollHeight, clientHeight: scroller.clientHeight };
  }
  const before = window.scrollY;
  window.scrollTo({ top: before + amount, behavior: 'instant' });
  window.dispatchEvent(new Event('scroll', { bubbles: true }));
  window.dispatchEvent(new WheelEvent('wheel', { deltaY: amount, bubbles: true, cancelable: true }));
  return { target: 'window', before, after: window.scrollY, scrollHeight: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0), clientHeight: window.innerHeight };
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
    count: seen.size, scroller: snapshot.scroller, scrollHeight: snapshot.scrollHeight,
    scrollY: snapshot.scrollY, clientHeight: snapshot.clientHeight, pageState: snapshot.pageState,
    title: snapshot.title, bodyText: snapshot.bodyText, finalUrl: snapshot.finalUrl,
  });

  let idleSteps = 0;
  let previousCount = seen.size;
  let previousHeight = snapshot.scrollHeight;
  let previousScrollY = snapshot.scrollY;
  const maxSteps = 150;
  const idleLimit = 12;

  for (let step = 1; step <= maxSteps && idleSteps < idleLimit; step++) {
    const amount = Math.max(350, Math.floor(snapshot.clientHeight * 0.78));
    const scrollAction = await page.evaluate(scrollReelsContainer, amount);
    await new Promise((resolve) => setTimeout(resolve, 1800));
    snapshot = await page.evaluate(getPageSnapshot);
    const count = mergeLinks(snapshot);
    const added = count - previousCount;
    const heightChanged = snapshot.scrollHeight !== previousHeight;
    const moved = snapshot.scrollY !== previousScrollY;
    idleSteps = added > 0 || heightChanged || snapshot.closedPopup ? 0 : idleSteps + 1;

    log('Scroll scan', {
      step, count, added, scroller: snapshot.scroller, scrollAction,
      scrollHeight: snapshot.scrollHeight, scrollY: snapshot.scrollY, moved, idleSteps,
      closedPopup: snapshot.closedPopup, pageState: snapshot.pageState,
      title: snapshot.title, bodyText: snapshot.bodyText, finalUrl: snapshot.finalUrl,
    });
    previousCount = count;
    previousHeight = snapshot.scrollHeight;
    previousScrollY = snapshot.scrollY;
    const atBottom = snapshot.scrollY + snapshot.clientHeight >= snapshot.scrollHeight - 80;
    if (atBottom && idleSteps >= 3) break;
  }

  return {
    links: Array.from(seen.values()), debugLogs,
    status: idleSteps >= idleLimit ? 'stopped_idle_limit' : 'stopped_after_scrolling',
    pageState: snapshot.pageState, finalUrl: snapshot.finalUrl,
  };
}
