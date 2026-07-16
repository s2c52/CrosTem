// chrome.storage.local cache with TTL, plus the persistent map of
// user-confirmed matches (steam appid -> codeweavers slug).
(function (global) {
  'use strict';

  const TTL_RESULT = 7 * 24 * 60 * 60 * 1000; // parsed pages/searches: 7 days
  const TTL_NEGATIVE = 24 * 60 * 60 * 1000;   // "no data" answers: 24 hours

  async function storageGet(key) {
    const obj = await chrome.storage.local.get(key);
    return obj[key];
  }

  async function get(key) {
    const entry = await storageGet('cache:' + key);
    if (!entry) return undefined;
    if (Date.now() > entry.expires) {
      chrome.storage.local.remove('cache:' + key);
      return undefined;
    }
    return entry.value;
  }

  async function set(key, value, ttlMs) {
    await chrome.storage.local.set({
      ['cache:' + key]: { value, expires: Date.now() + (ttlMs || TTL_RESULT) },
    });
  }

  async function getSlugChoice(appid) {
    return storageGet('choice:' + appid);
  }

  async function setSlugChoice(appid, slug) {
    await chrome.storage.local.set({ ['choice:' + appid]: slug });
  }

  async function clearSlugChoice(appid) {
    await chrome.storage.local.remove('choice:' + appid);
  }

  global.CWCache = {
    TTL_RESULT, TTL_NEGATIVE,
    get, set, getSlugChoice, setSlugChoice, clearSlugChoice,
  };
})(typeof self !== 'undefined' ? self : this);
