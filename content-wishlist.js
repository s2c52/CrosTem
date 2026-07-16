// Steam wishlist: automatic CrossOver badge per game row.
// The wishlist is a React SPA with obfuscated class names, so instead of
// relying on specific classes we look for links to /app/<id> that carry the
// game title as text, and attach a badge next to each. Native-Mac status
// comes from Steam's appdetails API (resolved lazily in lib/auto.js).
(function () {
  'use strict';

  const APP_LINK = /\/app\/(\d+)/;

  function looksLikeTitleLink(a) {
    if (a.dataset.crostem) return false;
    if (a.closest('.crostem-box, .crostem-badge, .crostem-overlay')) return false;
    const href = a.getAttribute('href') || '';
    if (!APP_LINK.test(href)) return false;
    const text = a.textContent.trim();
    // Skip icon/image-only links and huge container links.
    if (text.length < 2 || text.length > 150) return false;
    return true;
  }

  function scan() {
    document.querySelectorAll('a[href*="/app/"]').forEach((a) => {
      if (!looksLikeTitleLink(a)) return;
      a.dataset.crostem = '1';

      const badge = document.createElement('span');
      badge.className = 'crostem-badge';
      a.insertAdjacentElement('afterend', badge);

      CWAuto.attach(badge, {
        appid: (a.getAttribute('href').match(APP_LINK))[1],
        name: a.textContent.trim(),
        mode: 'inline',
      });
    });
  }

  let scheduled = false;
  function scheduleScan() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      scan();
    }, 300);
  }

  scan();
  new MutationObserver(scheduleScan)
    .observe(document.body, { childList: true, subtree: true });
})();
