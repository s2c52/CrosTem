// DOM builders for the app-page widget and common elements. The UI chrome
// is translated via i18n; statuses reported by the sources ("Runs
// Great", "playable"…) are kept as-is, as a quote from the source.
import { agwPageUrl } from './agw';
import { AWACY_SITE } from './awacy';
import { appUrl, searchUrl } from './client';
import { t } from './i18n';
import type { AgwCompat, AnticheatInfo, ArchInfo, CwAppPage, RankedResult, Verdict, VerdictLevel } from '../types';

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
  header.appendChild(el('span', 'crostem-logo', ''));
  header.appendChild(el('span', undefined, t('widgetTitle')));
  root.appendChild(header);
  return root;
}

const ARCH_SOURCE_KEYS = {
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
    const label = t(arch.arch === 'm-series' ? 'archM' : 'archIntel') +
      (arch.approximate ? ' ~' : '');
    body.appendChild(el('div', 'crostem-arch-line', label));
    body.appendChild(el('div', 'crostem-muted crostem-small', t(ARCH_SOURCE_KEYS[arch.source])));
  }
  body.appendChild(el('div', 'crostem-muted crostem-small', t('nativeNote')));
  root.appendChild(body);
  return root;
}

export function renderLoading(): HTMLElement {
  const root = box();
  root.appendChild(el('div', 'crostem-body crostem-muted', t('checking')));
  return root;
}

export function renderError(message?: string): HTMLElement {
  const root = box();
  const body = el('div', 'crostem-body');
  body.appendChild(el('div', 'crostem-muted', message ?? t('errorReach')));
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
  cwName?: string;
  approximate: boolean;
  /** User's CrossOver branch to highlight (e.g. "26"). */
  cxVersion?: string;
  onChangeMatch?: () => void;
  onRefresh?: () => void;
}

function section(root: HTMLElement, title: string): HTMLElement {
  const sec = el('div', 'crostem-section');
  sec.appendChild(el('div', 'crostem-section-title', title));
  root.appendChild(sec);
  return sec;
}

function isUserVersion(version: string, cxVersion?: string): boolean {
  if (!cxVersion) return false;
  return version === cxVersion || version.startsWith(cxVersion + '.');
}

/** Full widget for the game page: verdict + per-source breakdown. */
export function renderAppWidget(data: FullCompat, opts: AppWidgetOpts): HTMLElement {
  const root = box();
  const body = el('div', 'crostem-body');

  // Synthesized verdict
  const headline = el('div', 'crostem-headline');
  headline.appendChild(dotEl(data.verdict.level));
  headline.appendChild(el('span', 'crostem-verdict-label crostem-verdict-' + data.verdict.level,
    t('verdict_' + data.verdict.level)));
  body.appendChild(headline);

  // CodeWeavers
  const mac = data.cw?.mac ?? null;
  if (mac && data.cwSlug) {
    const sec = section(body, t('sectionCw'));
    const line = el('div', 'crostem-headline');
    line.appendChild(starsEl(mac.stars));
    line.appendChild(el('span', 'crostem-status ' + statusClass(mac.status), mac.status || 'Unrated'));
    sec.appendChild(line);
    if (mac.lastTested) {
      const testedLine = t('lastTested', mac.lastTested) +
        (mac.reportCount ? ` (${t('reports', String(mac.reportCount))})` : '');
      sec.appendChild(el('div', 'crostem-muted crostem-small', testedLine));
    }
    const macVersions = (data.cw?.versions ?? []).filter((v) => v.platform === 'macOS').slice(0, 3);
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
      sec.appendChild(table);
    }
    const foot = el('div', 'crostem-small');
    foot.appendChild(linkEl(appUrl(data.cwSlug), t('viewOnCw'), 'crostem-link crostem-small'));
    if (opts.approximate && opts.cwName) {
      foot.appendChild(el('span', 'crostem-muted crostem-small', ' · ' + t('approxMatch', opts.cwName)));
    }
    if (opts.onChangeMatch) {
      const change = el('a', 'crostem-link crostem-small', ' · ' + t('wrongMatch')) as HTMLAnchorElement;
      change.href = '#';
      change.addEventListener('click', (e) => {
        e.preventDefault();
        opts.onChangeMatch!();
      });
      foot.appendChild(change);
    }
    sec.appendChild(foot);
  } else {
    const sec = section(body, t('sectionCw'));
    sec.appendChild(el('div', 'crostem-muted crostem-small', t('noData')));
    sec.appendChild(linkEl(searchUrl(opts.gameName), t('searchCw'), 'crostem-link crostem-small'));
  }

  // AppleGamingWiki
  if (data.agw) {
    const sec = section(body, t('sectionAgw'));
    const rows: Array<[string, string]> = [
      ['CrossOver', data.agw.crossover],
      ['Parallels', data.agw.parallels],
      ['Rosetta 2', data.agw.rosetta2],
    ];
    for (const [label, status] of rows) {
      if (status === 'na' || status === 'unknown') continue;
      const row = el('div', 'crostem-version-row');
      row.appendChild(el('span', 'crostem-version-label', label));
      row.appendChild(el('span', agwStatusClass(status), status));
      sec.appendChild(row);
    }
    sec.appendChild(linkEl(agwPageUrl(data.agw.page), t('viewOnAgw'), 'crostem-link crostem-small'));
  }

  // Anticheat
  if (data.ac) {
    const sec = section(body, t('sectionAc'));
    const blocked = data.ac.status === 'Denied' || data.ac.status === 'Broken';
    const line = el('div', blocked ? 'crostem-status-bad' : 'crostem-small');
    line.textContent = `${blocked ? '⚠ ' : ''}${data.ac.anticheats.join(', ') || 'Anticheat'}: ${data.ac.status}`;
    sec.appendChild(line);
    const note = el('div', 'crostem-muted crostem-small');
    note.textContent = t('acLinuxNote');
    note.appendChild(linkEl(AWACY_SITE, 'AreWeAntiCheatYet ↗', 'crostem-link crostem-small'));
    sec.appendChild(note);
  }

  // Footer: refresh + attribution
  const footer = el('div', 'crostem-footer');
  if (opts.onRefresh) {
    const refresh = el('a', 'crostem-link crostem-small', t('refresh')) as HTMLAnchorElement;
    refresh.href = '#';
    refresh.title = t('refreshTitle');
    refresh.addEventListener('click', (e) => {
      e.preventDefault();
      opts.onRefresh!();
    });
    footer.appendChild(refresh);
  }
  footer.appendChild(el('div', 'crostem-muted crostem-small', t('attribution')));
  body.appendChild(footer);

  root.appendChild(body);
  return root;
}

/** Candidate picker when name matching is ambiguous. */
export function renderCandidateList(
  candidates: RankedResult[],
  gameName: string,
  onPick: (picked: RankedResult) => void,
): HTMLElement {
  const root = box();
  const body = el('div', 'crostem-body');
  body.appendChild(el('div', 'crostem-muted crostem-small', t('pickMatch')));
  const list = el('div', 'crostem-candidates');
  for (const c of candidates) {
    const btn = el('button', 'crostem-candidate');
    btn.appendChild(el('div', 'crostem-candidate-name', c.name));
    const bottom = el('div', 'crostem-muted crostem-small', c.company ? c.company + ' · ' : '');
    bottom.appendChild(starsEl(c.stars));
    btn.appendChild(bottom);
    btn.addEventListener('click', () => onPick(c));
    list.appendChild(btn);
  }
  body.appendChild(list);
  body.appendChild(linkEl(searchUrl(gameName), t('noneOfThese'), 'crostem-link crostem-small'));
  root.appendChild(body);
  return root;
}
