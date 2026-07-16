// High-level client used by content scripts: fetch (via the service worker,
// which bypasses CORS), parse, and cache CodeWeavers data.
(function (global) {
  'use strict';

  const CW_BASE = 'https://www.codeweavers.com';

  function fetchHtml(url) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'cwFetch', url }, (res) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (!res || !res.ok) {
          reject(new Error(res && res.error ? res.error : 'fetch failed'));
        } else {
          resolve(res.html);
        }
      });
    });
  }

  function searchUrl(query) {
    return CW_BASE + '/compatibility?name=' + encodeURIComponent(query);
  }

  function appUrl(slug) {
    return CW_BASE + '/compatibility/crossover/' + encodeURIComponent(slug);
  }

  // Search CodeWeavers by (simplified) game name. Returns parsed rows.
  async function search(name) {
    const query = global.CWMatcher.baseName(name);
    if (!query) return [];
    const cacheKey = 'search:' + query;
    const cached = await global.CWCache.get(cacheKey);
    if (cached !== undefined) return cached;

    const html = await fetchHtml(searchUrl(query));
    const results = global.CWParser.parseSearchResults(html);
    const ttl = results.length === 0
      ? global.CWCache.TTL_NEGATIVE
      : global.CWCache.TTL_RESULT;
    await global.CWCache.set(cacheKey, results, ttl);
    return results;
  }

  // Fetch and parse a CodeWeavers app page by slug.
  async function getApp(slug) {
    const cacheKey = 'app:' + slug;
    const cached = await global.CWCache.get(cacheKey);
    if (cached !== undefined) return cached;

    const html = await fetchHtml(appUrl(slug));
    const data = global.CWParser.parseAppPage(html);
    await global.CWCache.set(cacheKey, data,
      data ? global.CWCache.TTL_RESULT : global.CWCache.TTL_NEGATIVE);
    return data;
  }

  // --- Steam appdetails (same-origin from store.steampowered.com) ---
  // Used to get the game name and native-Mac flag for capsules that only
  // carry an image. Throttled and cached long-term to respect Steam's
  // rate limits on this endpoint.

  const STEAM_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days
  const STEAM_MAX_CONCURRENT = 2;
  let steamActive = 0;
  const steamQueue = [];
  const steamInflight = new Map(); // appid -> Promise

  function steamPump() {
    while (steamActive < STEAM_MAX_CONCURRENT && steamQueue.length > 0) {
      const job = steamQueue.shift();
      steamActive++;
      fetchSteamDetails(job.appid)
        .then(job.resolve, job.reject)
        .finally(() => {
          steamActive--;
          steamInflight.delete(job.appid);
          steamPump();
        });
    }
  }

  async function fetchSteamDetails(appid) {
    const url = 'https://store.steampowered.com/api/appdetails?appids=' +
      encodeURIComponent(appid) + '&filters=platforms,basic';
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    const entry = json && json[appid];
    const value = (entry && entry.success && entry.data)
      ? {
          name: entry.data.name || null,
          mac: !!(entry.data.platforms && entry.data.platforms.mac),
        }
      : null;
    await global.CWCache.set('steam:' + appid, value,
      value ? STEAM_TTL : global.CWCache.TTL_NEGATIVE);
    return value;
  }

  // Returns {name, mac} or null (unknown app / lookup failed).
  async function steamDetails(appid) {
    const cached = await global.CWCache.get('steam:' + appid);
    if (cached !== undefined) return cached;
    if (steamInflight.has(appid)) return steamInflight.get(appid);
    const p = new Promise((resolve, reject) => {
      steamQueue.push({ appid, resolve, reject });
      steamPump();
    });
    steamInflight.set(appid, p);
    return p;
  }

  global.CWClient = { search, getApp, searchUrl, appUrl, steamDetails };
})(typeof self !== 'undefined' ? self : this);
