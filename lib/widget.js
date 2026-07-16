// DOM builders for the CrosTem widget and badges. Texts stay in English,
// faithful to CodeWeavers' own wording.
(function (global) {
  'use strict';

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function starsEl(n, max) {
    max = max || 5;
    const span = el('span', 'crostem-stars');
    if (n == null) {
      span.textContent = '—';
      return span;
    }
    span.appendChild(el('span', 'crostem-stars-filled', '★'.repeat(n)));
    span.appendChild(el('span', 'crostem-stars-empty', '☆'.repeat(Math.max(0, max - n))));
    return span;
  }

  function statusClass(status) {
    const s = (status || '').toLowerCase();
    if (s.includes('great')) return 'crostem-status-great';
    if (s.includes('well')) return 'crostem-status-well';
    if (s.includes('will not') || s.includes('not work') || s.includes("won't")) {
      return 'crostem-status-bad';
    }
    return 'crostem-status-mid';
  }

  function linkEl(href, text, className) {
    const a = el('a', className || 'crostem-link', text);
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  }

  function box(title) {
    const root = el('div', 'crostem-box');
    const header = el('div', 'crostem-header');
    header.appendChild(el('span', 'crostem-logo', ''));
    header.appendChild(el('span', null, title));
    root.appendChild(header);
    return root;
  }

  function renderNativeBadge() {
    const root = box('macOS');
    const body = el('div', 'crostem-body');
    body.appendChild(el('span', 'crostem-native-badge', 'Native on macOS'));
    body.appendChild(el('div', 'crostem-muted crostem-small',
      'This game ships with a native Mac version — no CrossOver needed.'));
    root.appendChild(body);
    return root;
  }

  function renderLoading() {
    const root = box('CrossOver');
    const body = el('div', 'crostem-body crostem-muted', 'Checking CodeWeavers…');
    root.appendChild(body);
    return root;
  }

  function renderError(message) {
    const root = box('CrossOver');
    const body = el('div', 'crostem-body');
    body.appendChild(el('div', 'crostem-muted', message || "Couldn't reach CodeWeavers."));
    root.appendChild(body);
    return root;
  }

  function renderNoData(gameName) {
    const root = box('CrossOver');
    const body = el('div', 'crostem-body');
    body.appendChild(el('div', 'crostem-muted', 'No data on CodeWeavers.'));
    body.appendChild(linkEl(global.CWClient.searchUrl(gameName),
      'Search CodeWeavers manually ↗'));
    root.appendChild(body);
    return root;
  }

  // Full widget for the app page.
  // data: result of CWParser.parseAppPage; opts: {slug, cwName, approximate, onChangeMatch}
  function renderAppWidget(data, opts) {
    const root = box('CrossOver · macOS');
    const body = el('div', 'crostem-body');

    const mac = data.mac || {};
    const headline = el('div', 'crostem-headline');
    headline.appendChild(starsEl(mac.stars));
    headline.appendChild(el('span', 'crostem-status ' + statusClass(mac.status),
      mac.status || 'Unrated'));
    body.appendChild(headline);

    if (mac.lastTested) {
      body.appendChild(el('div', 'crostem-muted crostem-small',
        'Last Tested: ' + mac.lastTested +
        (mac.reportCount ? ' (' + mac.reportCount + ' reports)' : '')));
    }

    const macVersions = (data.versions || [])
      .filter((v) => v.platform === 'macOS')
      .slice(0, 3);
    if (macVersions.length > 0) {
      const table = el('div', 'crostem-versions');
      macVersions.forEach((v) => {
        const row = el('div', 'crostem-version-row' +
          (v.version.startsWith('26.') ? ' crostem-version-current' : ''));
        row.appendChild(el('span', 'crostem-version-label', v.version));
        row.appendChild(starsEl(v.stars));
        table.appendChild(row);
      });
      body.appendChild(table);
    }

    const footer = el('div', 'crostem-footer');
    footer.appendChild(linkEl(global.CWClient.appUrl(opts.slug), 'View on CodeWeavers ↗'));
    if (opts.approximate && opts.cwName) {
      footer.appendChild(el('div', 'crostem-muted crostem-small',
        'Approximate match: “' + opts.cwName + '”'));
    }
    if (opts.onChangeMatch) {
      const change = el('a', 'crostem-link crostem-small', 'Wrong match?');
      change.href = '#';
      change.addEventListener('click', (e) => {
        e.preventDefault();
        opts.onChangeMatch();
      });
      footer.appendChild(change);
    }
    body.appendChild(footer);
    root.appendChild(body);
    return root;
  }

  // Candidate picker when the name match is ambiguous.
  function renderCandidateList(candidates, gameName, onPick) {
    const root = box('CrossOver · macOS');
    const body = el('div', 'crostem-body');
    body.appendChild(el('div', 'crostem-muted crostem-small',
      'Several possible matches on CodeWeavers — pick the right one:'));
    const list = el('div', 'crostem-candidates');
    candidates.forEach((c) => {
      const btn = el('button', 'crostem-candidate');
      const top = el('div', 'crostem-candidate-name', c.name);
      const bottom = el('div', 'crostem-muted crostem-small',
        (c.company ? c.company + ' · ' : ''));
      bottom.appendChild(starsEl(c.stars));
      btn.appendChild(top);
      btn.appendChild(bottom);
      btn.addEventListener('click', () => onPick(c));
      list.appendChild(btn);
    });
    body.appendChild(list);
    body.appendChild(linkEl(global.CWClient.searchUrl(gameName),
      'None of these — search CodeWeavers ↗', 'crostem-link crostem-small'));
    root.appendChild(body);
    return root;
  }

  global.CWWidget = {
    starsEl,
    renderNativeBadge,
    renderLoading,
    renderError,
    renderNoData,
    renderAppWidget,
    renderCandidateList,
  };
})(typeof self !== 'undefined' ? self : this);
