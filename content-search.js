// Steam search results: automatic CrossOver badge per row (loads when the
// row becomes visible, via the shared observer in lib/auto.js).
(function () {
  'use strict';

  function processRow(row) {
    if (row.dataset.crostem) return;
    row.dataset.crostem = '1';

    const titleEl = row.querySelector('.search_name .title');
    if (!titleEl) return;
    const name = titleEl.textContent.trim();
    if (!name) return;

    const badge = document.createElement('span');
    badge.className = 'crostem-badge';
    titleEl.insertAdjacentElement('afterend', badge);

    const appid = row.getAttribute('data-ds-appid') || null;
    // Search rows always show platform icons, so absence of the Mac icon is
    // a reliable "not native" signal.
    CWAuto.attach(badge, {
      appid,
      name,
      native: !!row.querySelector('.platform_img.mac'),
      mode: 'inline',
    });
  }

  function scan(root) {
    (root || document).querySelectorAll('a.search_result_row').forEach(processRow);
  }

  scan();

  // Steam loads more rows via AJAX (infinite scroll / pagination).
  const resultsContainer = document.getElementById('search_resultsRows') ||
    document.getElementById('search_results') || document.body;
  new MutationObserver(() => scan(resultsContainer))
    .observe(resultsContainer, { childList: true, subtree: true });
})();
