function isVisible(element) {
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 &&
    style.display !== 'none' && style.visibility !== 'hidden' &&
    Number(style.opacity || 1) > 0;
}

function inspectLoginPopup() {
  const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [aria-modal="true"]'))
    .filter(isVisible);
  for (const dialog of dialogs) {
    const text = (dialog.innerText || '').slice(0, 500);
    const closeButton = Array.from(dialog.querySelectorAll('[role="button"], button, [aria-label]'))
      .find((button) => isVisible(button) && /^(close|đóng|dismiss)$/i.test(button.getAttribute('aria-label') || ''));
    if (/see more on facebook|log in to facebook|email address or phone number/i.test(text)) {
      return { visible: true, closable: Boolean(closeButton), text };
    }
  }
  return { visible: false, closable: false, text: '' };
}

function closeVisiblePopup() {
  const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [aria-modal="true"]'))
    .filter(isVisible);
  for (const dialog of dialogs) {
    const buttons = dialog.querySelectorAll('[aria-label], button, [role="button"]');
    for (const button of buttons) {
      if (isVisible(button) && /^(close|đóng|dismiss)$/i.test(button.getAttribute('aria-label') || '')) {
        button.click();
        return true;
      }
    }
  }
  return false;
}

function getPageSnapshot() {
  const closedPopup = closeVisiblePopup();
  const loginPopup = inspectLoginPopup();
  const links = new Map();
  for (const anchor of document.querySelectorAll('a[href]')) {
    try {
      const url = new URL(anchor.href, location.href);
      const match = url.pathname.match(/^\/reel\/(\d+)/i);
      if (match && /(^|\.)facebook\.com$/i.test(url.hostname)) {
        links.set(match[1], `https://www.facebook.com/reel/${match[1]}/`);
      }
    } catch { /* Ignore malformed anchors. */ }
  }

  return {
    links: Array.from(links.entries()),
    pageState: /\/checkpoint\//i.test(location.pathname)
      ? 'checkpoint'
      : /\/login(?:\/|$)/i.test(location.pathname)
        ? 'login_required'
        : loginPopup.visible && !loginPopup.closable
          ? 'login_popup_blocked'
          : 'loaded',
    loginPopup,
    finalUrl: location.href,
    title: document.title,
    bodyText: (document.body?.innerText || '').slice(0, 500),
    scrollY: window.scrollY,
    scrollHeight: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0),
    clientHeight: window.innerHeight,
    closedPopup,
  };
}

function findScrollableContainer() {
  const preferred = document.querySelector('#scrollview');
  if (preferred && preferred.scrollHeight > preferred.clientHeight + 100) return preferred;

  const candidates = Array.from(document.querySelectorAll('main, [role="main"], div, section'))
    .filter((element) => {
      const style = getComputedStyle(element);
      return /(auto|scroll)/i.test(style.overflowY) &&
        element.scrollHeight > element.clientHeight + 150 &&
        element.querySelector('a[href*="/reel/"]');
    });
  candidates.sort((a, b) => {
    const aCount = a.querySelectorAll('a[href*="/reel/"]').length;
    const bCount = b.querySelectorAll('a[href*="/reel/"]').length;
    return bCount - aCount || b.scrollHeight - a.scrollHeight;
  });
  return candidates[0] || null;
}

function getMetrics(useWindow, scroller) {
  return {
    top: useWindow ? window.scrollY : scroller.scrollTop,
    clientHeight: useWindow ? window.innerHeight : scroller.clientHeight,
    scrollHeight: useWindow
      ? Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0)
      : scroller.scrollHeight,
  };
}

async function dragScrollbar(page, useWindow, scroller, before) {
  if (!useWindow) {
    const box = await scroller.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel({ deltaY: Math.max(300, Math.floor(before.clientHeight * 0.72)) });
      return { method: 'container-wheel', amount: Math.max(300, Math.floor(before.clientHeight * 0.72)) };
    }
  }

  const viewport = page.viewport() || { width: 1280, height: 1024 };
  const amount = Math.max(300, Math.floor(before.clientHeight * 0.72));
  const trackX = Math.max(2, viewport.width - 4);
  const thumbHeight = Math.max(24, before.clientHeight * before.clientHeight / before.scrollHeight);
  const maxThumbTop = Math.max(1, before.clientHeight - thumbHeight);
  const maxScroll = Math.max(1, before.scrollHeight - before.clientHeight);
  const thumbTop = Math.min(maxThumbTop, (before.top / maxScroll) * maxThumbTop);
  const startY = Math.min(viewport.height - 4, Math.max(4, thumbTop + thumbHeight / 2));
  const endY = Math.min(viewport.height - 4, startY + amount);

  if (endY - startY > 8) {
    await page.mouse.move(trackX, startY);
    await page.mouse.down();
    await page.mouse.move(trackX, endY, { steps: 8 });
    await page.mouse.up();
    return { method: 'right-scrollbar-drag', amount: endY - startY, startY, endY };
  }

  await page.mouse.move(Math.floor(viewport.width / 2), Math.floor(viewport.height / 2));
  await page.mouse.wheel({ deltaY: amount });
  return { method: 'page-wheel-fallback', amount };
}

export async function scrapePage(page) {
  const seen = new Map();
  const debugLogs = [];
  const log = (msg, meta = {}) => debugLogs.push({ time: new Date().toISOString(), msg, meta });
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const mergeLinks = (snapshot) => {
    for (const [id, url] of snapshot.links || []) if (!seen.has(id)) seen.set(id, url);
    return seen.size;
  };

  let snapshot = await page.evaluate(getPageSnapshot);
  mergeLinks(snapshot);
  log('Initial scan complete', {
    count: seen.size, pageState: snapshot.pageState,
    popup: snapshot.loginPopup, scrollHeight: snapshot.scrollHeight,
  });

  const scroller = await page.evaluateHandle(findScrollableContainer);
  const scrollerElement = scroller.asElement();
  const useWindow = !scrollerElement;
  let idleSteps = 0;
  let previousCount = seen.size;
  let lastHeight = snapshot.scrollHeight;
  const maxSteps = 180;
  const idleLimit = 8;

  for (let step = 1; step <= maxSteps && idleSteps < idleLimit; step++) {
    snapshot = await page.evaluate(getPageSnapshot);
    mergeLinks(snapshot);
    if (snapshot.pageState === 'checkpoint' || snapshot.pageState === 'login_required' ||
        (snapshot.pageState === 'login_popup_blocked' && !snapshot.loginPopup.closable)) {
      log('Stopped because Facebook blocked further browsing', {
        step, pageState: snapshot.pageState, popup: snapshot.loginPopup, count: seen.size,
      });
      break;
    }

    const before = await page.evaluate(getMetrics, useWindow, scrollerElement);
    const scrollAction = await dragScrollbar(page, useWindow, scrollerElement, before);
    await pause(1800);

    snapshot = await page.evaluate(getPageSnapshot);
    const count = mergeLinks(snapshot);
    const after = await page.evaluate(getMetrics, useWindow, scrollerElement);
    const added = count - previousCount;
    const heightChanged = after.scrollHeight !== lastHeight;
    idleSteps = added > 0 || heightChanged ? 0 : idleSteps + 1;
    log('Continuous browser scroll scan', {
      step, count, added, heightChanged, idleSteps, scrollAction,
      before, after, pageState: snapshot.pageState, popup: snapshot.loginPopup,
    });
    previousCount = count;
    lastHeight = after.scrollHeight;

    if (snapshot.pageState === 'login_popup_blocked' || snapshot.pageState === 'checkpoint' || snapshot.pageState === 'login_required') break;
    const atBottom = after.top + after.clientHeight >= after.scrollHeight - 80;
    if (atBottom && idleSteps >= 3) break;
  }

  snapshot = await page.evaluate(getPageSnapshot);
  mergeLinks(snapshot);
  if (scrollerElement) await scroller.dispose();

  const status = snapshot.pageState === 'login_popup_blocked'
    ? 'stopped_login_popup_without_close'
    : snapshot.pageState === 'checkpoint'
      ? 'stopped_checkpoint'
      : snapshot.pageState === 'login_required'
        ? 'stopped_login_required'
        : idleSteps >= idleLimit ? 'stopped_idle_limit' : 'stopped_after_scrolling';

  return {
    links: Array.from(seen.values()), debugLogs, status,
    pageState: snapshot.pageState, finalUrl: snapshot.finalUrl,
  };
}
