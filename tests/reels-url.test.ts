import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReelsTabUrl } from '../reels-url.ts';

test('accepts a username URL with or without a trailing slash', () => {
  assert.deepEqual(buildReelsTabUrl('https://www.facebook.com/example'), {
    profileId: 'example',
    reelsTabUrl: 'https://www.facebook.com/example/reels/',
  });
  assert.equal(buildReelsTabUrl('facebook.com/example/').reelsTabUrl, 'https://www.facebook.com/example/reels/');
});

test('converts a numeric profile id to the Reels tab URL', () => {
  assert.deepEqual(buildReelsTabUrl('https://www.facebook.com/profile.php?id=123456'), {
    profileId: '123456',
    reelsTabUrl: 'https://www.facebook.com/profile.php?id=123456&sk=reels_tab',
  });
});

test('supports Facebook people profile URLs', () => {
  assert.deepEqual(buildReelsTabUrl('https://www.facebook.com/people/Example-Name/123456/'), {
    profileId: '123456',
    reelsTabUrl: 'https://www.facebook.com/profile.php?id=123456&sk=reels_tab',
  });
});

test('accepts Facebook subdomains but rejects lookalike or external hosts', () => {
  assert.equal(buildReelsTabUrl('https://m.facebook.com/example').reelsTabUrl, 'https://www.facebook.com/example/reels/');
  assert.throws(() => buildReelsTabUrl('https://facebook.com.attacker.example/user'), /Facebook/i);
  assert.throws(() => buildReelsTabUrl('https://example.com/user'), /Facebook/i);
});

test('rejects empty and unidentifiable profile URLs', () => {
  assert.throws(() => buildReelsTabUrl('   '), /Facebook/i);
  assert.throws(() => buildReelsTabUrl('https://www.facebook.com/'), /Không xác định/);
  assert.throws(() => buildReelsTabUrl('https://www.facebook.com/profile.php'), /Không xác định/);
});
