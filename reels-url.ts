export type ReelsTabTarget = { profileId: string; reelsTabUrl: string };

/**
 * Convert a Facebook profile URL into its Reels tab URL.
 * Kept pure so profile URL handling can be covered by unit tests without launching a browser.
 */
export function buildReelsTabUrl(inputUrl: string): ReelsTabTarget {
  const value = inputUrl.trim();
  if (!value) throw new Error('Vui lòng nhập URL hồ sơ Facebook hợp lệ.');

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    throw new Error('Vui lòng nhập URL hồ sơ Facebook hợp lệ.');
  }

  if (!/(^|\.)facebook\.com$/i.test(url.hostname)) {
    throw new Error('Vui lòng nhập URL hồ sơ Facebook hợp lệ.');
  }

  const idParam = url.searchParams.get('id');
  const peopleMatch = url.pathname.match(/\/people\/[^/]+\/(\d+)/i);
  const profileId = idParam || peopleMatch?.[1];
  if (profileId) {
    return {
      profileId,
      reelsTabUrl: `https://www.facebook.com/profile.php?id=${encodeURIComponent(profileId)}&sk=reels_tab`,
    };
  }

  const cleanPath = url.pathname.replace(/\/$/, '');
  if (!cleanPath || cleanPath === '/profile.php') {
    throw new Error('Không xác định được hồ sơ từ URL Facebook đã nhập.');
  }

  return {
    profileId: cleanPath.split('/').pop() || 'unknown',
    reelsTabUrl: `https://www.facebook.com${cleanPath}/reels/`,
  };
}
