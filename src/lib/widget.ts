// Constructores de DOM del widget de ficha y elementos comunes. Los textos
// se mantienen en inglés, fieles a la redacción de las fuentes.
import { agwPageUrl } from './agw';
import { AWACY_SITE } from './awacy';
import { appUrl, searchUrl } from './client';
import type { AgwCompat, AnticheatInfo, CwAppPage, RankedResult, Verdict, VerdictLevel } from '../types';

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

/** Punto de semáforo del veredicto. */
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

function box(title: string): HTMLElement {
  const root = el('div', 'crostem-box');
  const header = el('div', 'crostem-header');
  header.appendChild(el('span', 'crostem-logo', ''));
  header.appendChild(el('span', undefined, title));
  root.appendChild(header);
  return root;
}

export function renderNativeBadge(): HTMLElement {
  const root = box('Runs on Mac?');
  const body = el('div', 'crostem-body');
  body.appendChild(el('span', 'crostem-native-badge', 'Native on macOS'));
  body.appendChild(el('div', 'crostem-muted crostem-small',
    'This game ships with a native Mac version — no CrossOver needed.'));
  root.appendChild(body);
  return root;
}

export function renderLoading(): HTMLElement {
  const root = box('Runs on Mac?');
  root.appendChild(el('div', 'crostem-body crostem-muted', 'Checking compatibility sources…'));
  return root;
}

export function renderError(message?: string): HTMLElement {
  const root = box('Runs on Mac?');
  const body = el('div', 'crostem-body');
  body.appendChild(el('div', 'crostem-muted', message ?? "Couldn't reach the compatibility sources."));
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
  onChangeMatch?: () => void;
  onRefresh?: () => void;
}

function section(root: HTMLElement, title: string): HTMLElement {
  const sec = el('div', 'crostem-section');
  sec.appendChild(el('div', 'crostem-section-title', title));
  root.appendChild(sec);
  return sec;
}

/** Widget completo para la ficha del juego: veredicto + desglose por fuente. */
export function renderAppWidget(data: FullCompat, opts: AppWidgetOpts): HTMLElement {
  const root = box('Runs on Mac?');
  const body = el('div', 'crostem-body');

  // Veredicto sintetizado
  const headline = el('div', 'crostem-headline');
  headline.appendChild(dotEl(data.verdict.level));
  headline.appendChild(el('span', 'crostem-verdict-label crostem-verdict-' + data.verdict.level,
    data.verdict.label));
  body.appendChild(headline);

  // CodeWeavers
  const mac = data.cw?.mac ?? null;
  if (mac && data.cwSlug) {
    const sec = section(body, 'CrossOver — CodeWeavers');
    const line = el('div', 'crostem-headline');
    line.appendChild(starsEl(mac.stars));
    line.appendChild(el('span', 'crostem-status ' + statusClass(mac.status), mac.status || 'Unrated'));
    sec.appendChild(line);
    if (mac.lastTested) {
      sec.appendChild(el('div', 'crostem-muted crostem-small',
        'Last Tested: ' + mac.lastTested +
        (mac.reportCount ? ` (${mac.reportCount} reports)` : '')));
    }
    const macVersions = (data.cw?.versions ?? []).filter((v) => v.platform === 'macOS').slice(0, 3);
    if (macVersions.length > 0) {
      const table = el('div', 'crostem-versions');
      for (const v of macVersions) {
        const row = el('div', 'crostem-version-row' +
          (v.version.startsWith('26.') ? ' crostem-version-current' : ''));
        row.appendChild(el('span', 'crostem-version-label', v.version));
        row.appendChild(starsEl(v.stars));
        table.appendChild(row);
      }
      sec.appendChild(table);
    }
    const foot = el('div', 'crostem-small');
    foot.appendChild(linkEl(appUrl(data.cwSlug), 'View on CodeWeavers ↗', 'crostem-link crostem-small'));
    if (opts.approximate && opts.cwName) {
      foot.appendChild(el('span', 'crostem-muted crostem-small', ` · approximate match: “${opts.cwName}”`));
    }
    if (opts.onChangeMatch) {
      const change = el('a', 'crostem-link crostem-small', ' · Wrong match?') as HTMLAnchorElement;
      change.href = '#';
      change.addEventListener('click', (e) => {
        e.preventDefault();
        opts.onChangeMatch!();
      });
      foot.appendChild(change);
    }
    sec.appendChild(foot);
  } else {
    const sec = section(body, 'CrossOver — CodeWeavers');
    sec.appendChild(el('div', 'crostem-muted crostem-small', 'No data.'));
    sec.appendChild(linkEl(searchUrl(opts.gameName), 'Search CodeWeavers ↗', 'crostem-link crostem-small'));
  }

  // AppleGamingWiki
  if (data.agw) {
    const sec = section(body, 'AppleGamingWiki');
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
    sec.appendChild(linkEl(agwPageUrl(data.agw.page), 'View on AppleGamingWiki ↗', 'crostem-link crostem-small'));
  }

  // Anticheat
  if (data.ac) {
    const sec = section(body, 'Anticheat');
    const blocked = data.ac.status === 'Denied' || data.ac.status === 'Broken';
    const line = el('div', blocked ? 'crostem-status-bad' : 'crostem-small');
    line.textContent = `${blocked ? '⚠ ' : ''}${data.ac.anticheats.join(', ') || 'Anticheat'}: ${data.ac.status}`;
    sec.appendChild(line);
    const note = el('div', 'crostem-muted crostem-small');
    note.textContent = 'Linux/Proton data — indicative for CrossOver. ';
    note.appendChild(linkEl(AWACY_SITE, 'AreWeAntiCheatYet ↗', 'crostem-link crostem-small'));
    sec.appendChild(note);
  }

  // Pie: refresh + atribución
  const footer = el('div', 'crostem-footer');
  if (opts.onRefresh) {
    const refresh = el('a', 'crostem-link crostem-small', '↻ Refresh data') as HTMLAnchorElement;
    refresh.href = '#';
    refresh.title = 'Clear cached data for this game and re-check all sources';
    refresh.addEventListener('click', (e) => {
      e.preventDefault();
      opts.onRefresh!();
    });
    footer.appendChild(refresh);
  }
  footer.appendChild(el('div', 'crostem-muted crostem-small',
    'Data: CodeWeavers · AppleGamingWiki · AreWeAntiCheatYet. Not affiliated.'));
  body.appendChild(footer);

  root.appendChild(body);
  return root;
}

/** Selector de candidatos cuando el matching por nombre es ambiguo. */
export function renderCandidateList(
  candidates: RankedResult[],
  gameName: string,
  onPick: (picked: RankedResult) => void,
): HTMLElement {
  const root = box('Runs on Mac?');
  const body = el('div', 'crostem-body');
  body.appendChild(el('div', 'crostem-muted crostem-small',
    'Several possible matches on CodeWeavers — pick the right one:'));
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
  body.appendChild(linkEl(searchUrl(gameName),
    'None of these — search CodeWeavers ↗', 'crostem-link crostem-small'));
  root.appendChild(body);
  return root;
}
