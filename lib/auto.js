// Automatic badge resolution shared by capsules, search results and wishlist.
// Elements are registered with attach(); a shared IntersectionObserver only
// resolves the ones that become visible, keeping requests to CodeWeavers and
// Steam to a minimum (plus the 7/30-day caches in CWCache).
(function (global) {
  'use strict';

  const registry = new WeakMap(); // element -> opts

  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      io.unobserve(entry.target);
      const opts = registry.get(entry.target);
      registry.delete(entry.target);
      if (opts) resolveAndRender(entry.target, opts);
    });
  }, { rootMargin: '150px' });

  // opts: { appid?, name?, native? (true/false/undefined), mode: 'overlay'|'inline' }
  function attach(el, opts) {
    if (opts.native === true) {
      render(el, { kind: 'native' }, opts);
      return;
    }
    registry.set(el, opts);
    io.observe(el);
  }

  async function resolveAndRender(el, opts) {
    try {
      const result = await resolve(opts);
      render(el, result, opts);
    } catch (_) {
      render(el, { kind: 'none' }, opts);
    }
  }

  async function resolve(opts) {
    let name = opts.name || null;
    let native = opts.native; // undefined = unknown

    if ((name == null || native == null) && opts.appid) {
      try {
        const details = await global.CWClient.steamDetails(opts.appid);
        if (details) {
          if (name == null) name = details.name;
          if (native == null) native = details.mac;
        }
      } catch (_) { /* Steam lookup failed; carry on with what we have */ }
    }

    if (native === true) return { kind: 'native' };
    if (!name) return { kind: 'none' };

    // A match the user confirmed earlier wins over name matching.
    if (opts.appid) {
      const savedSlug = await global.CWCache.getSlugChoice(opts.appid);
      if (savedSlug) {
        const app = await global.CWClient.getApp(savedSlug);
        if (app && app.mac) {
          return {
            kind: 'stars', stars: app.mac.stars, slug: savedSlug,
            cwName: name, approximate: false,
          };
        }
      }
    }

    const results = await global.CWClient.search(name);
    const ranked = global.CWMatcher.rank(name, results);
    if (ranked.confident) {
      return {
        kind: 'stars',
        stars: ranked.confident.stars,
        slug: ranked.confident.slug,
        cwName: ranked.confident.name,
        approximate: ranked.confident.score < 1,
      };
    }
    // A single plausible candidate is worth showing as an approximate match;
    // only genuinely ambiguous cases (2+) defer to CodeWeavers.
    if (ranked.candidates.length === 1) {
      const only = ranked.candidates[0];
      return {
        kind: 'stars', stars: only.stars, slug: only.slug,
        cwName: only.name, approximate: true,
      };
    }
    if (ranked.candidates.length > 1) {
      return { kind: 'ambiguous', count: ranked.candidates.length, query: name };
    }
    return { kind: 'none' };
  }

  function cwLink(href, title) {
    const a = document.createElement('a');
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.className = 'crostem-badge-result';
    if (title) a.title = title;
    // Capsules/rows are themselves links with JS handlers; keep this click ours.
    a.addEventListener('click', (e) => e.stopPropagation());
    return a;
  }

  function render(el, result, opts) {
    el.textContent = '';
    const overlay = opts.mode === 'overlay';

    switch (result.kind) {
      case 'native': {
        const span = document.createElement('span');
        span.className = 'crostem-badge-native';
        span.textContent = overlay ? '' : ' native';
        span.title = 'Native on macOS';
        el.appendChild(span);
        break;
      }
      case 'stars': {
        const a = cwLink(global.CWClient.appUrl(result.slug),
          (result.cwName || '') + ' — CrossOver rating on CodeWeavers' +
          (result.approximate ? ' (approximate match)' : ''));
        a.appendChild(global.CWWidget.starsEl(result.stars));
        if (result.approximate) {
          const tilde = document.createElement('span');
          tilde.className = 'crostem-small';
          tilde.textContent = '~';
          a.appendChild(tilde);
        }
        el.appendChild(a);
        break;
      }
      case 'ambiguous': {
        const a = cwLink(global.CWClient.searchUrl(result.query),
          result.count + ' possible matches on CodeWeavers');
        a.textContent = overlay ? '?' : result.count + ' matches ↗';
        el.appendChild(a);
        break;
      }
      default: { // 'none'
        if (overlay) {
          el.remove();
        } else {
          const span = document.createElement('span');
          span.className = 'crostem-muted crostem-small';
          span.textContent = 'no data';
          el.appendChild(span);
        }
      }
    }
  }

  global.CWAuto = { attach };
})(typeof self !== 'undefined' ? self : this);
