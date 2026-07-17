// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Steam game page: "Runs on Mac?" widget with combined verdict
// (CodeWeavers + AppleGamingWiki + anticheat) and per-source breakdown.
import { agwCacheKey, agwSearchUrl } from '../lib/agw';
import { resolveNativeArch } from '../lib/arch';
import * as cache from '../lib/cache';
import { appCacheKey, searchCacheKey, steamCacheKey } from '../lib/client';
import { logDebug, logWarn } from '../lib/log';
import { initContentI18n, t } from '../lib/i18n';
import { resolveGame } from '../lib/resolve';
import { getSettings } from '../lib/settings';
import {
  renderAppWidget,
  renderCandidateList,
  renderError,
  renderLoading,
  renderNativeBadge,
} from '../lib/widget';
import type { RankedResult } from '../types';
import '../styles.css';

const appidFromPath = location.pathname.match(/\/app\/(\d+)/)?.[1];
const nameEl =
  document.getElementById('appHubAppName') ?? document.querySelector('.apphub_AppName');
const nameFromDom = nameEl?.textContent?.trim();

if (appidFromPath && nameFromDom) {
  const appid = appidFromPath;
  const gameName = nameFromDom;

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

  const isNativeMac = (): boolean =>
    !!document.querySelector(
      '#game_area_purchase .game_area_purchase_platform .platform_img.mac, ' +
        '.sysreq_tabs .sysreq_tab[data-os="mac"]',
    );

  const refresh = async (): Promise<void> => {
    const savedSlug = await cache.getSourceChoice('cw', appid);
    const keys = [
      searchCacheKey(gameName),
      agwCacheKey(gameName),
      steamCacheKey(appid),
      'awacy:index',
    ];
    if (savedSlug) keys.push(appCacheKey(savedSlug));
    await cache.remove(...keys);
    void resolveAll(false);
  };

  const showCandidates = (candidates: RankedResult[]): void => {
    show(
      renderCandidateList(candidates, gameName, async (picked) => {
        await cache.setSourceChoice('cw', appid, picked.slug);
        void resolveAll(false);
      }),
    );
  };

  const showAgwCandidates = (candidates: RankedResult[]): void => {
    show(
      renderCandidateList(
        candidates,
        gameName,
        async (picked) => {
          // AGW candidates carry the page name in `slug`.
          await cache.setSourceChoice('agw', appid, picked.slug);
          await cache.remove(agwCacheKey(gameName));
          void resolveAll(false);
        },
        {
          prompt: t('agwPickMatch'),
          searchHref: agwSearchUrl(gameName),
          searchLabel: t('agwNoneOfThese'),
        },
      ),
    );
  };

  const resolveAll = async (forcePicker: boolean): Promise<void> => {
    show(renderLoading());
    try {
      const settings = await getSettings();
      const { cw, agw, agwCandidates, ac, verdict } = await resolveGame(gameName, appid, {
        forcePicker,
      });

      if (cw.kind === 'ambiguous') {
        showCandidates(cw.candidates);
        return;
      }

      const cwApp = cw.kind === 'hit' ? cw.app : null;
      show(
        renderAppWidget(
          { cw: cwApp, cwSlug: cw.kind === 'hit' ? cw.slug : null, agw, ac, verdict },
          {
            gameName,
            cwName: cw.kind === 'hit' ? cw.cwName : undefined,
            approximate: cw.kind === 'hit' ? cw.approximate : false,
            cxVersion: settings.crossoverVersion,
            onChangeMatch: async () => {
              await cache.clearSourceChoice('cw', appid);
              void resolveAll(true);
            },
            onChangeAgwMatch:
              agwCandidates.length > 0
                ? async () => {
                    await cache.clearSourceChoice('agw', appid);
                    showAgwCandidates(agwCandidates);
                  }
                : undefined,
            onRefresh: refresh,
          },
        ),
      );
    } catch (e) {
      // Friendly, localized message; the technical detail goes to the console.
      logDebug('widget resolution failed', e);
      show(renderError(t('errorFriendly'), () => void resolveAll(false)));
    }
  };

  void (async () => {
    const settings = await initContentI18n();
    if (!settings.surfaces.app) return;
    if (!mount()) return;
    if (isNativeMac()) {
      // Immediate badge; the architecture (M Series / Intel) arrives async.
      show(renderNativeBadge());
      void resolveNativeArch(gameName, appid)
        .then((arch) => {
          if (arch) show(renderNativeBadge(arch));
        })
        .catch((e: unknown) => logWarn('native arch resolution failed', e));
      return;
    }
    void resolveAll(false);
  })();
}
