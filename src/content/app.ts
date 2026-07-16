// Ficha del juego en Steam: widget completo de compatibilidad CrossOver.
import * as cache from '../lib/cache';
import { getApp, search } from '../lib/client';
import { rank } from '../lib/matcher';
import {
  renderAppWidget, renderCandidateList, renderError, renderLoading,
  renderNativeBadge, renderNoData,
} from '../lib/widget';
import type { RankedResult } from '../types';
import '../styles.css';

const appidMatch = location.pathname.match(/\/app\/(\d+)/);
const nameEl = document.getElementById('appHubAppName') ??
  document.querySelector('.apphub_AppName');

if (appidMatch && nameEl?.textContent?.trim()) {
  const appid = appidMatch[1];
  const gameName = nameEl.textContent.trim();

  const container = document.createElement('div');
  container.id = 'crostem-widget';

  const mount = (): boolean => {
    const rightCol = document.querySelector('.game_meta_data');
    if (rightCol) {
      rightCol.insertBefore(container, rightCol.firstChild);
      return true;
    }
    const purchase = document.getElementById('game_area_purchase');
    if (purchase?.parentNode) {
      purchase.parentNode.insertBefore(container, purchase);
      return true;
    }
    return false;
  };

  const show = (node: HTMLElement): void => {
    container.textContent = '';
    container.appendChild(node);
  };

  const isNativeMac = (): boolean => !!document.querySelector(
    '#game_area_purchase .game_area_purchase_platform .platform_img.mac, ' +
    '.sysreq_tabs .sysreq_tab[data-os="mac"]',
  );

  const showApp = async (slug: string, opts: { cwName?: string; approximate: boolean }): Promise<void> => {
    show(renderLoading());
    try {
      const data = await getApp(slug);
      if (!data) {
        show(renderNoData(gameName));
        return;
      }
      show(renderAppWidget(data, {
        slug,
        cwName: opts.cwName,
        approximate: opts.approximate,
        onChangeMatch: async () => {
          await cache.clearSlugChoice(appid);
          void resolveByName(true);
        },
      }));
    } catch (e) {
      show(renderError(`Couldn't load CodeWeavers data (${(e as Error).message})`));
    }
  };

  const showCandidates = (candidates: RankedResult[]): void => {
    show(renderCandidateList(candidates, gameName, async (picked) => {
      await cache.setSlugChoice(appid, picked.slug);
      void showApp(picked.slug, { cwName: picked.name, approximate: picked.score < 1 });
    }));
  };

  const resolveByName = async (forcePicker: boolean): Promise<void> => {
    show(renderLoading());
    try {
      const results = await search(gameName);
      const ranked = rank(gameName, results);
      if (!forcePicker && ranked.confident) {
        void showApp(ranked.confident.slug, {
          cwName: ranked.confident.name,
          approximate: ranked.confident.score < 1,
        });
      } else if (ranked.candidates.length > 0) {
        showCandidates(ranked.candidates);
      } else {
        show(renderNoData(gameName));
      }
    } catch (e) {
      show(renderError(`Couldn't reach CodeWeavers (${(e as Error).message})`));
    }
  };

  void (async () => {
    if (!mount()) return;
    if (isNativeMac()) {
      show(renderNativeBadge());
      return;
    }
    const savedSlug = await cache.getSlugChoice(appid);
    if (savedSlug) {
      void showApp(savedSlug, { approximate: false });
    } else {
      void resolveByName(false);
    }
  })();
}
