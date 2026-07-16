// Parsers for CodeWeavers compatibility pages. All scraping selectors live
// here so a site redesign only requires touching this file.
(function (global) {
  'use strict';

  function parseDoc(html) {
    return new DOMParser().parseFromString(html, 'text/html');
  }

  // <ul class="star-rating-table"> with one li.active per filled star.
  function starsFrom(container) {
    const ul = container && container.querySelector('ul.star-rating-table');
    if (!ul) return null;
    return ul.querySelectorAll('li.active').length;
  }

  function textOf(el) {
    return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
  }

  // Search results: https://www.codeweavers.com/compatibility?name=<query>
  // Table #teTable-app: | Application | Company | Last Updated | Rating (Mac) |
  function parseSearchResults(html) {
    const doc = parseDoc(html);
    const rows = doc.querySelectorAll('#teTable-app tbody tr');
    const results = [];
    rows.forEach((tr) => {
      const link = tr.querySelector('a[href^="/compatibility/crossover/"]');
      if (!link) return;
      const slug = link.getAttribute('href').split('/').filter(Boolean).pop();
      const tds = tr.querySelectorAll('td');
      results.push({
        name: textOf(link),
        slug,
        company: textOf(tds[1]),
        lastUpdated: textOf(tds[2]),
        stars: starsFrom(tr),
      });
    });
    return results;
  }

  function parseRatingBox(box) {
    if (!box) return null;
    // span.txt_yellow holds the status text; the Linux heading (h3) also
    // carries .txt_yellow, so the selector must be span-specific.
    const status = textOf(box.querySelector('span.txt_yellow'));
    const small = textOf(box.querySelector('.small'));
    const m = small.match(/Last Tested:\s*([\d.]+)\s*(?:\((\d+)\))?/i);
    return {
      stars: starsFrom(box),
      status,
      lastTested: m ? m[1] : null,
      reportCount: m && m[2] ? parseInt(m[2], 10) : null,
    };
  }

  // App page: https://www.codeweavers.com/compatibility/crossover/<slug>
  function parseAppPage(html) {
    const doc = parseDoc(html);
    const ratingRoot = doc.querySelector('#appRating');
    if (!ratingRoot) return null;

    const result = {
      slug: textOf(doc.querySelector('#var_app_plnk')) || null,
      mac: parseRatingBox(ratingRoot.querySelector('.os_Mac')),
      linux: parseRatingBox(ratingRoot.querySelector('.os_Linux')),
      versions: [],
      aggregate: null,
    };

    // Per-CrossOver-version breakdown (#breakdown .breakdown-row), newest first.
    doc.querySelectorAll('#breakdown .breakdown-row .card-header').forEach((header) => {
      const text = textOf(header);
      const vm = text.match(/(\d+(?:\.\d+)+)/);
      if (!vm) return;
      const platform = header.querySelector('.fa-apple') ? 'macOS'
        : header.querySelector('.fa-linux') ? 'Linux'
        : (/linux/i.test(text) ? 'Linux' : 'macOS');
      result.versions.push({
        version: vm[1],
        platform,
        stars: starsFrom(header),
      });
    });

    // Aggregate rating from JSON-LD, if present.
    doc.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
      if (result.aggregate) return;
      try {
        const data = JSON.parse(s.textContent);
        const nodes = data['@graph'] || [data];
        for (const node of nodes) {
          if (node && node.aggregateRating) {
            result.aggregate = {
              value: Number(node.aggregateRating.ratingValue),
              count: Number(node.aggregateRating.ratingCount),
            };
            break;
          }
        }
      } catch (_) { /* ignore malformed JSON-LD */ }
    });

    return result;
  }

  global.CWParser = { parseSearchResults, parseAppPage };
})(typeof self !== 'undefined' ? self : this);
