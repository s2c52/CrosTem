// Steam app page: full CrossOver compatibility widget.
(function () {
  'use strict';

  const appidMatch = location.pathname.match(/\/app\/(\d+)/);
  if (!appidMatch) return;
  const appid = appidMatch[1];

  const nameEl = document.getElementById('appHubAppName') ||
    document.querySelector('.apphub_AppName');
  if (!nameEl) return;
  const gameName = nameEl.textContent.trim();
  if (!gameName) return;

  const container = document.createElement('div');
  container.id = 'crostem-widget';

  function mount() {
    const rightCol = document.querySelector('.game_meta_data');
    if (rightCol) {
      rightCol.insertBefore(container, rightCol.firstChild);
      return true;
    }
    const purchase = document.getElementById('game_area_purchase');
    if (purchase && purchase.parentNode) {
      purchase.parentNode.insertBefore(container, purchase);
      return true;
    }
    return false;
  }

  function show(node) {
    container.textContent = '';
    container.appendChild(node);
  }

  function isNativeMac() {
    return !!document.querySelector(
      '#game_area_purchase .game_area_purchase_platform .platform_img.mac, ' +
      '.sysreq_tabs .sysreq_tab[data-os="mac"]'
    );
  }

  async function showApp(slug, opts) {
    show(CWWidget.renderLoading());
    try {
      const data = await CWClient.getApp(slug);
      if (!data) {
        show(CWWidget.renderNoData(gameName));
        return;
      }
      show(CWWidget.renderAppWidget(data, {
        slug,
        cwName: opts.cwName,
        approximate: !!opts.approximate,
        onChangeMatch: async () => {
          await CWCache.clearSlugChoice(appid);
          resolveByName(true);
        },
      }));
    } catch (e) {
      show(CWWidget.renderError("Couldn't load CodeWeavers data (" + e.message + ')'));
    }
  }

  function showCandidates(candidates) {
    show(CWWidget.renderCandidateList(candidates, gameName, async (picked) => {
      await CWCache.setSlugChoice(appid, picked.slug);
      showApp(picked.slug, { cwName: picked.name, approximate: picked.score < 1 });
    }));
  }

  async function resolveByName(forcePicker) {
    show(CWWidget.renderLoading());
    try {
      const results = await CWClient.search(gameName);
      const ranked = CWMatcher.rank(gameName, results);
      if (!forcePicker && ranked.confident) {
        showApp(ranked.confident.slug, {
          cwName: ranked.confident.name,
          approximate: ranked.confident.score < 1,
        });
      } else if (ranked.candidates.length > 0) {
        showCandidates(ranked.candidates);
      } else {
        show(CWWidget.renderNoData(gameName));
      }
    } catch (e) {
      show(CWWidget.renderError("Couldn't reach CodeWeavers (" + e.message + ')'));
    }
  }

  async function main() {
    if (!mount()) return;

    if (isNativeMac()) {
      show(CWWidget.renderNativeBadge());
      return;
    }

    const savedSlug = await CWCache.getSlugChoice(appid);
    if (savedSlug) {
      showApp(savedSlug, { approximate: false });
    } else {
      resolveByName(false);
    }
  }

  main();
})();
