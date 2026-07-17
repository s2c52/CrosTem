// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// DOM builders for the app-page widget and common elements. The UI chrome
// is translated via i18n; statuses reported by the sources ("Runs
// Great", "playable"…) are kept as-is, as a quote from the source.
import { agwPageUrl } from './agw';
import { AWACY_SITE } from './awacy';
import { appUrl, searchUrl } from './client';
import { MAX_VERSION_ROWS } from './constants';
import { t } from './i18n';
import { ctLogo } from './logo';
import type {
  AgwCompat,
  AnticheatInfo,
  ArchInfo,
  CwAppPage,
  RankedResult,
  Verdict,
  VerdictLevel,
} from '../types';

function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function starsEl(n: number | null, max = 5): HTMLElement {
  const span = el('span', 'crostem-stars');
  if (n == null) {
    span.textContent = '—';
    return span;
  }
  span.appendChild(el('span', 'crostem-stars-filled', '★'.repeat(n)));
  span.appendChild(el('span', 'crostem-stars-empty', '☆'.repeat(Math.max(0, max - n))));
  return span;
}

/** Verdict traffic-light dot. */
export function dotEl(level: VerdictLevel, title?: string): HTMLElement {
  const dot = el('span', 'crostem-dot crostem-dot-' + level);
  if (title) dot.title = title;
  return dot;
}

function statusClass(status: string): string {
  const s = (status || '').toLowerCase();
  if (s.includes('great')) return 'crostem-status-great';
  if (s.includes('well')) return 'crostem-status-well';
  if (s.includes('will not') || s.includes('not work') || s.includes("won't")) {
    return 'crostem-status-bad';
  }
  return 'crostem-status-mid';
}

function agwStatusClass(status: string): string {
  if (status === 'perfect' || status === 'playable') return 'crostem-status-great';
  if (status === 'runs') return 'crostem-status-mid';
  if (status === 'na' || status === 'unknown') return 'crostem-muted';
  return 'crostem-status-bad';
}

function linkEl(href: string, text: string, className = 'crostem-link'): HTMLAnchorElement {
  const a = el('a', className, text) as HTMLAnchorElement;
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

function box(): HTMLElement {
  const root = el('div', 'crostem-box');
  const header = el('div', 'crostem-header');
  header.appendChild(ctLogo(14));
  header.appendChild(el('span', undefined, t('widgetTitle')));
  root.appendChild(header);
  return root;
}

export const ARCH_SOURCE_KEYS = {
  agw: 'archSourceAgw',
  'steam-reqs': 'archSourceSteam',
  date: 'archSourceDate',
} as const;

export function renderNativeBadge(arch: ArchInfo | null = null): HTMLElement {
  const root = box();
  const body = el('div', 'crostem-body');
  const line = el('div', 'crostem-headline');
  line.appendChild(starsEl(5));
  line.appendChild(el('span', 'crostem-native-badge', t('nativeBadge')));
  body.appendChild(line);
  if (arch) {
    const label =
      t(arch.arch === 'm-series' ? 'archM' : 'archIntel') + (arch.approximate ? ' ~' : '');
    body.appendChild(el('div', 'crostem-arch-line', label));
    const sourceLine = el('div', 'crostem-muted crostem-small');
    if (arch.source === 'agw' && arch.agwPage) {
      // Link to the game's AGW page so the claim can be verified.
      sourceLine.appendChild(
        linkEl(agwPageUrl(arch.agwPage), t(ARCH_SOURCE_KEYS.agw), 'crostem-link crostem-small'),
      );
    } else {
      sourceLine.textContent = t(ARCH_SOURCE_KEYS[arch.source]);
    }
    body.appendChild(sourceLine);
  }
  body.appendChild(el('div', 'crostem-muted crostem-small', t('nativeNote')));
  root.appendChild(body);
  return root;
}

/** Skeleton with the final widget's shape, so the layout doesn't jump. */
export function renderLoading(): HTMLElement {
  const root = box();
  const body = el('div', 'crostem-body crostem-skeleton-body');
  body.setAttribute('role', 'status');
  body.setAttribute('aria-label', t('checking'));
  body.appendChild(el('div', 'crostem-skeleton crostem-skeleton-banner'));
  for (let i = 0; i < 3; i++) {
    body.appendChild(el('div', 'crostem-skeleton crostem-skeleton-row'));
  }
  root.appendChild(body);
  return root;
}

export function renderError(
  message?: string,
  onRetry?: () => void | Promise<void>,
): HTMLElement {
  const root = box();
  const body = el('div', 'crostem-body crostem-error');
  body.appendChild(el('div', 'crostem-muted', message ?? t('errorReach')));
  if (onRetry) {
    const btn = el('button', 'crostem-retry', t('retry')) as HTMLButtonElement;
    btn.type = 'button';
    btn.addEventListener('click', () => void onRetry());
    body.appendChild(btn);
  }
  root.appendChild(body);
  return root;
}

export interface FullCompat {
  cw: CwAppPage | null;
  cwSlug: string | null;
  agw: AgwCompat | null;
  ac: AnticheatInfo | null;
  verdict: Verdict;
}

export interface AppWidgetOpts {
  gameName: string;
  cwName?: string | undefined;
  approximate: boolean;
  /** User's CrossOver branch to highlight (e.g. "26"). */
  cxVersion?: string | undefined;
  onChangeMatch?: (() => void | Promise<void>) | undefined;
  /** Opens the AppleGamingWiki correction picker. */
  onChangeAgwMatch?: (() => void | Promise<void>) | undefined;
  onRefresh?: (() => void | Promise<void>) | undefined;
}

function inlineAction(label: string, onClick: () => void | Promise<void>): HTMLAnchorElement {
  const a = el('a', 'crostem-link crostem-small', label) as HTMLAnchorElement;
  a.href = '#';
  a.addEventListener('click', (e) => {
    e.preventDefault();
    void onClick();
  });
  return a;
}

const VERDICT_GLYPHS: Record<VerdictLevel, string> = {
  green: '✓',
  yellow: '～',
  red: '✕',
  unknown: '?',
};

/** Verdict banner: soft verdict-tinted strip readable at a glance. */
function bannerEl(verdict: Verdict): HTMLElement {
  const banner = el('div', 'crostem-banner crostem-banner-' + verdict.level);
  banner.setAttribute('role', 'status');
  const dot = el('span', 'crostem-dot crostem-dot-' + verdict.level + ' crostem-banner-dot');
  dot.appendChild(el('span', 'crostem-banner-glyph', VERDICT_GLYPHS[verdict.level]));
  banner.appendChild(dot);
  banner.appendChild(
    el(
      'span',
      'crostem-banner-label crostem-verdict-' + verdict.level,
      t('verdict_' + verdict.level),
    ),
  );
  return banner;
}

/**
 * Compact one-line source row. With `detail` nodes the row becomes a
 * disclosure button (aria-expanded) that unfolds the detail panel; the
 * detail stays in the DOM either way, only its height is animated.
 */
function sourceRow(
  root: HTMLElement,
  title: string,
  summary: HTMLElement[],
  detail?: HTMLElement[],
): void {
  const sec = el('div', 'crostem-source');
  const hasDetail = !!detail && detail.length > 0;
  const row = el(
    hasDetail ? 'button' : 'div',
    'crostem-source-row' + (hasDetail ? ' crostem-source-toggle' : ''),
  );
  row.appendChild(el('span', 'crostem-source-name', title));
  const sum = el('span', 'crostem-source-summary');
  for (const node of summary) sum.appendChild(node);
  row.appendChild(sum);
  sec.appendChild(row);

  if (hasDetail) {
    (row as HTMLButtonElement).type = 'button';
    row.setAttribute('aria-expanded', 'false');
    row.appendChild(el('span', 'crostem-chevron', '▸'));
    const panel = el('div', 'crostem-source-detail');
    const inner = el('div', 'crostem-source-detail-inner');
    for (const node of detail) inner.appendChild(node);
    panel.appendChild(inner);
    row.addEventListener('click', () => {
      const open = sec.classList.toggle('crostem-open');
      row.setAttribute('aria-expanded', String(open));
    });
    sec.appendChild(panel);
  }
  root.appendChild(sec);
}

function isUserVersion(version: string, cxVersion?: string): boolean {
  if (!cxVersion) return false;
  return version === cxVersion || version.startsWith(cxVersion + '.');
}

/** Full widget for the game page: verdict banner + per-source breakdown. */
export function renderAppWidget(data: FullCompat, opts: AppWidgetOpts): HTMLElement {
  const root = box();
  root.appendChild(bannerEl(data.verdict));
  const body = el('div', 'crostem-body');

  // CodeWeavers
  const mac = data.cw?.mac ?? null;
  if (mac && data.cwSlug) {
    const summary = [
      starsEl(mac.stars),
      el('span', 'crostem-status ' + statusClass(mac.status), mac.status || 'Unrated'),
    ];
    const detail: HTMLElement[] = [];
    if (mac.lastTested) {
      const testedLine =
        t('lastTested', mac.lastTested) +
        (mac.reportCount ? ` (${t('reports', String(mac.reportCount))})` : '');
      detail.push(el('div', 'crostem-muted crostem-small', testedLine));
    }
    const macVersions = (data.cw?.versions ?? [])
      .filter((v) => v.platform === 'macOS')
      .slice(0, MAX_VERSION_ROWS);
    if (macVersions.length > 0) {
      const table = el('div', 'crostem-versions');
      for (const v of macVersions) {
        const mine = isUserVersion(v.version, opts.cxVersion);
        const row = el('div', 'crostem-version-row' + (mine ? ' crostem-version-current' : ''));
        const label = el('span', 'crostem-version-label', v.version);
        if (mine) label.title = t('yourVersion');
        row.appendChild(label);
        row.appendChild(starsEl(v.stars));
        table.appendChild(row);
      }
      detail.push(table);
    }
    const foot = el('div', 'crostem-small');
    foot.appendChild(linkEl(appUrl(data.cwSlug), t('viewOnCw'), 'crostem-link crostem-small'));
    if (opts.approximate && opts.cwName) {
      foot.appendChild(
        el('span', 'crostem-muted crostem-small', ' · ' + t('approxMatch', opts.cwName)),
      );
    }
    const onChangeMatch = opts.onChangeMatch;
    if (onChangeMatch) {
      const change = el(
        'a',
        'crostem-link crostem-small',
        ' · ' + t('wrongMatch'),
      ) as HTMLAnchorElement;
      change.href = '#';
      change.addEventListener('click', (e) => {
        e.preventDefault();
        void onChangeMatch();
      });
      foot.appendChild(change);
    }
    detail.push(foot);
    sourceRow(body, t('sectionCw'), summary, detail);
  } else {
    sourceRow(
      body,
      t('sectionCw'),
      [el('span', 'crostem-muted crostem-small', t('noData'))],
      [linkEl(searchUrl(opts.gameName), t('searchCw'), 'crostem-link crostem-small')],
    );
  }

  // AppleGamingWiki
  if (data.agw) {
    const rows: Array<[string, string]> = [
      ['CrossOver', data.agw.crossover],
      ['Parallels', data.agw.parallels],
      ['Rosetta 2', data.agw.rosetta2],
    ];
    const meaningful = rows.filter(([, status]) => status !== 'na' && status !== 'unknown');
    const first = meaningful[0];
    const summary = first
      ? [el('span', agwStatusClass(first[1]), `${first[0]}: ${first[1]}`)]
      : [el('span', 'crostem-muted crostem-small', t('noData'))];
    const detail: HTMLElement[] = [];
    for (const [label, status] of meaningful) {
      const row = el('div', 'crostem-version-row');
      row.appendChild(el('span', 'crostem-version-label', label));
      row.appendChild(el('span', agwStatusClass(status), status));
      detail.push(row);
    }
    const foot = el('div', 'crostem-small');
    foot.appendChild(linkEl(agwPageUrl(data.agw.page), t('viewOnAgw'), 'crostem-link crostem-small'));
    if (opts.onChangeAgwMatch) {
      foot.appendChild(document.createTextNode(' · '));
      foot.appendChild(inlineAction(t('wrongMatch'), opts.onChangeAgwMatch));
    }
    detail.push(foot);
    sourceRow(body, t('sectionAgw'), summary, detail);
  } else if (opts.onChangeAgwMatch) {
    // No confident AGW match, but there are plausible pages to pick from.
    sourceRow(
      body,
      t('sectionAgw'),
      [el('span', 'crostem-muted crostem-small', t('noData'))],
      [inlineAction(t('agwCandidatesLink'), opts.onChangeAgwMatch)],
    );
  }

  // Anticheat
  if (data.ac) {
    const blocked = data.ac.status === 'Denied' || data.ac.status === 'Broken';
    const summary = [
      el(
        'span',
        blocked ? 'crostem-status-bad' : 'crostem-small',
        `${blocked ? '⚠ ' : ''}${data.ac.status}`,
      ),
    ];
    const line = el('div', blocked ? 'crostem-status-bad crostem-small' : 'crostem-small');
    line.textContent = `${data.ac.anticheats.join(', ') || 'Anticheat'}: ${data.ac.status}`;
    const note = el('div', 'crostem-muted crostem-small');
    note.textContent = t('acLinuxNote');
    note.appendChild(linkEl(AWACY_SITE, 'AreWeAntiCheatYet ↗', 'crostem-link crostem-small'));
    sourceRow(body, t('sectionAc'), summary, [line, note]);
  }

  // Footer: refresh + attribution
  const footer = el('div', 'crostem-footer');
  const onRefresh = opts.onRefresh;
  if (onRefresh) {
    const refresh = el('a', 'crostem-link crostem-small', t('refresh')) as HTMLAnchorElement;
    refresh.href = '#';
    refresh.title = t('refreshTitle');
    refresh.addEventListener('click', (e) => {
      e.preventDefault();
      void onRefresh();
    });
    footer.appendChild(refresh);
  }
  footer.appendChild(el('div', 'crostem-muted crostem-small', t('attribution')));
  body.appendChild(footer);

  root.appendChild(body);
  return root;
}

export interface CandidateListOpts {
  /** Prompt above the list; defaults to the CodeWeavers wording. */
  prompt?: string;
  /** "None of these" escape hatch; defaults to CodeWeavers search. */
  searchHref?: string;
  searchLabel?: string;
}

/** Candidate picker when name matching is ambiguous (CW or AGW). */
export function renderCandidateList(
  candidates: RankedResult[],
  gameName: string,
  onPick: (picked: RankedResult) => void | Promise<void>,
  opts: CandidateListOpts = {},
): HTMLElement {
  const root = box();
  const body = el('div', 'crostem-body');
  body.appendChild(el('div', 'crostem-muted crostem-small', opts.prompt ?? t('pickMatch')));
  const list = el('div', 'crostem-candidates');
  for (const c of candidates) {
    const btn = el('button', 'crostem-candidate');
    btn.appendChild(el('div', 'crostem-candidate-name', c.name));
    const bottom = el('div', 'crostem-muted crostem-small', c.company ? c.company + ' · ' : '');
    if (c.stars != null) bottom.appendChild(starsEl(c.stars));
    btn.appendChild(bottom);
    btn.addEventListener('click', () => void onPick(c));
    list.appendChild(btn);
  }
  body.appendChild(list);
  body.appendChild(
    linkEl(
      opts.searchHref ?? searchUrl(gameName),
      opts.searchLabel ?? t('noneOfThese'),
      'crostem-link crostem-small',
    ),
  );
  root.appendChild(body);
  return root;
}
