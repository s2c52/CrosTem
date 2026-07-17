// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// The single badge renderer shared by capsules overlays, search rows and
// the wishlist (every surface goes through auto.ts -> renderBadge). Also
// wires the rich hover tooltip fed with the resolved data.
import { appUrl, searchUrl } from './client';
import { t } from './i18n';
import { attachTooltip, type TooltipData } from './tooltip';
import { ARCH_SOURCE_KEYS, dotEl, starsEl } from './widget';
import type { AutoAttachOpts, ResolveResult } from '../types';

function cwLink(href: string, label?: string): HTMLAnchorElement {
  const a = document.createElement('a');
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.className = 'crostem-badge-result';
  if (label) a.setAttribute('aria-label', label);
  // Capsules/rows are themselves links with JS handlers; this click is ours.
  a.addEventListener('click', (e) => e.stopPropagation());
  return a;
}

function tooltipFor(result: ResolveResult): TooltipData | null {
  switch (result.kind) {
    case 'native': {
      const arch = result.arch;
      const lines: string[] = [];
      if (arch) {
        lines.push(
          t(arch.arch === 'm-series' ? 'archM' : 'archIntel') + (arch.approximate ? ' ~' : ''),
        );
        lines.push(t(ARCH_SOURCE_KEYS[arch.source]));
      }
      return { level: 'green', title: t('nativeBadge'), stars: 5, lines };
    }
    case 'stars': {
      const lines = [
        t('badgeCwRating', result.cwName) + (result.approximate ? ' ' + t('badgeApprox') : ''),
      ];
      return { level: result.level, title: t('verdict_' + result.level), stars: result.stars, lines };
    }
    case 'ambiguous':
      return {
        level: result.level,
        title: t('verdict_' + result.level),
        lines: [t('badgeMatches', String(result.count))],
      };
    case 'dot':
      return { level: result.level, title: t('verdict_' + result.level) };
    default:
      return null;
  }
}

export function renderBadge(el: HTMLElement, result: ResolveResult, opts: AutoAttachOpts): void {
  el.textContent = '';
  const overlay = opts.mode === 'overlay';

  switch (result.kind) {
    case 'native': {
      const span = document.createElement('span');
      span.className = 'crostem-badge-native';
      span.appendChild(starsEl(5));
      const arch = result.arch;
      if (arch) {
        const tag = document.createElement('span');
        tag.className = 'crostem-arch-tag';
        tag.textContent =
          t(arch.arch === 'm-series' ? 'archMShort' : 'archIntelShort') +
          (arch.approximate ? '~' : '');
        span.appendChild(tag);
      }
      span.setAttribute(
        'aria-label',
        t('nativeBadge') +
          (arch
            ? ' — ' +
              t(arch.arch === 'm-series' ? 'archM' : 'archIntel') +
              (arch.approximate ? ' ~' : '') +
              ' · ' +
              t(ARCH_SOURCE_KEYS[arch.source])
            : ''),
      );
      el.appendChild(span);
      break;
    }
    case 'stars': {
      const a = cwLink(
        appUrl(result.slug),
        t('badgeCwRating', result.cwName) + (result.approximate ? ' ' + t('badgeApprox') : ''),
      );
      a.appendChild(dotEl(result.level));
      a.appendChild(starsEl(result.stars));
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
      const a = cwLink(searchUrl(result.query), t('badgeMatches', String(result.count)));
      if (result.level !== 'unknown') a.appendChild(dotEl(result.level));
      a.appendChild(document.createTextNode(overlay ? '?' : t('matchesN', String(result.count))));
      el.appendChild(a);
      break;
    }
    case 'dot': {
      const dot = dotEl(result.level);
      dot.setAttribute('aria-label', t('verdict_' + result.level));
      el.appendChild(dot);
      break;
    }
    default: {
      if (overlay) {
        el.remove();
      } else {
        const span = document.createElement('span');
        span.className = 'crostem-muted crostem-small';
        span.textContent = t('noDataInline');
        el.appendChild(span);
      }
      return;
    }
  }

  const data = tooltipFor(result);
  if (data) attachTooltip(el, data);
}
