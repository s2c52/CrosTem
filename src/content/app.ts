// Ficha del juego en Steam: widget "Runs on Mac?" con veredicto combinado
// (CodeWeavers + AppleGamingWiki + anticheat) y desglose por fuente.
import { agwCacheKey, agwLookup } from '../lib/agw';
import { anticheatLookup } from '../lib/awacy';
import * as cache from '../lib/cache';
import { appCacheKey, getApp, search, searchCacheKey, steamCacheKey } from '../lib/client';
import { rank } from '../lib/matcher';
import { computeVerdict } from '../lib/verdict';
import {
  renderAppWidget, renderCandidateList, renderError, renderLoading, renderNativeBadge,
} from '../lib/widget';
import type { CwAppPage, RankedResult } from '../types';
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

  interface CwResolution {
    app: CwAppPage | null;
    slug: string | null;
    cwName?: string;
    approximate: boolean;
    candidates?: RankedResult[];
  }

  // Resuelve la parte de CodeWeavers: elección guardada → ficha directa;
  // si no, búsqueda + ranking (candidatos si es ambiguo).
  const resolveCw = async (forcePicker: boolean): Promise<CwResolution> => {
    if (!forcePicker) {
      const savedSlug = await cache.getSourceChoice('cw', appid);
      if (savedSlug) {
        return { app: await getApp(savedSlug), slug: savedSlug, approximate: false };
      }
    }
    const results = await search(gameName);
    const ranked = rank(gameName, results);
    const pick = (!forcePicker && ranked.confident) ||
      (ranked.candidates.length === 1 ? ranked.candidates[0] : null);
    if (pick) {
      return {
        app: await getApp(pick.slug),
        slug: pick.slug,
        cwName: pick.name,
        approximate: pick.score < 1,
      };
    }
    if (ranked.candidates.length > 1) {
      return { app: null, slug: null, approximate: false, candidates: ranked.candidates };
    }
    return { app: null, slug: null, approximate: false };
  };

  const refresh = async (): Promise<void> => {
    const savedSlug = await cache.getSourceChoice('cw', appid);
    const keys = [searchCacheKey(gameName), agwCacheKey(gameName), steamCacheKey(appid), 'awacy:index'];
    if (savedSlug) keys.push(appCacheKey(savedSlug));
    await cache.remove(...keys);
    void resolveAll(false);
  };

  const showCandidates = (candidates: RankedResult[]): void => {
    show(renderCandidateList(candidates, gameName, async (picked) => {
      await cache.setSourceChoice('cw', appid, picked.slug);
      void resolveAll(false);
    }));
  };

  const resolveAll = async (forcePicker: boolean): Promise<void> => {
    show(renderLoading());
    try {
      // Las tres fuentes en paralelo; AGW y anticheat no deben romper nada.
      const [cw, agw, ac] = await Promise.all([
        resolveCw(forcePicker),
        agwLookup(gameName, appid).catch(() => null),
        anticheatLookup(appid, gameName).catch(() => null),
      ]);

      if (cw.candidates) {
        showCandidates(cw.candidates);
        return;
      }

      const verdict = computeVerdict(cw.app?.mac ?? null, agw, ac);
      show(renderAppWidget(
        { cw: cw.app, cwSlug: cw.slug, agw, ac, verdict },
        {
          gameName,
          cwName: cw.cwName,
          approximate: cw.approximate,
          onChangeMatch: async () => {
            await cache.clearSourceChoice('cw', appid);
            void resolveAll(true);
          },
          onRefresh: () => void refresh(),
        },
      ));
    } catch (e) {
      show(renderError(`Couldn't load compatibility data (${(e as Error).message})`));
    }
  };

  void (async () => {
    if (!mount()) return;
    if (isNativeMac()) {
      show(renderNativeBadge());
      return;
    }
    void resolveAll(false);
  })();
}
