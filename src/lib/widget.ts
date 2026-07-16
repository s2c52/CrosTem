// Constructores de DOM del widget de ficha y elementos comunes. Los textos
// se mantienen en inglés, fieles a la redacción de CodeWeavers.
import { appUrl, searchUrl } from './client';
import type { CwAppPage, RankedResult } from '../types';

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

function statusClass(status: string): string {
  const s = (status || '').toLowerCase();
  if (s.includes('great')) return 'crostem-status-great';
  if (s.includes('well')) return 'crostem-status-well';
  if (s.includes('will not') || s.includes('not work') || s.includes("won't")) {
    return 'crostem-status-bad';
  }
  return 'crostem-status-mid';
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
  const root = box('macOS');
  const body = el('div', 'crostem-body');
  body.appendChild(el('span', 'crostem-native-badge', 'Native on macOS'));
  body.appendChild(el('div', 'crostem-muted crostem-small',
    'This game ships with a native Mac version — no CrossOver needed.'));
  root.appendChild(body);
  return root;
}

export function renderLoading(): HTMLElement {
  const root = box('CrossOver');
  root.appendChild(el('div', 'crostem-body crostem-muted', 'Checking CodeWeavers…'));
  return root;
}

export function renderError(message?: string): HTMLElement {
  const root = box('CrossOver');
  const body = el('div', 'crostem-body');
  body.appendChild(el('div', 'crostem-muted', message ?? "Couldn't reach CodeWeavers."));
  root.appendChild(body);
  return root;
}

export function renderNoData(gameName: string): HTMLElement {
  const root = box('CrossOver');
  const body = el('div', 'crostem-body');
  body.appendChild(el('div', 'crostem-muted', 'No data on CodeWeavers.'));
  body.appendChild(linkEl(searchUrl(gameName), 'Search CodeWeavers manually ↗'));
  root.appendChild(body);
  return root;
}

export interface AppWidgetOpts {
  slug: string;
  cwName?: string;
  approximate: boolean;
  onChangeMatch?: () => void;
}

/** Widget completo para la ficha del juego. */
export function renderAppWidget(data: CwAppPage, opts: AppWidgetOpts): HTMLElement {
  const root = box('CrossOver · macOS');
  const body = el('div', 'crostem-body');

  const mac = data.mac;
  const headline = el('div', 'crostem-headline');
  headline.appendChild(starsEl(mac?.stars ?? null));
  headline.appendChild(el('span', 'crostem-status ' + statusClass(mac?.status ?? ''),
    mac?.status || 'Unrated'));
  body.appendChild(headline);

  if (mac?.lastTested) {
    body.appendChild(el('div', 'crostem-muted crostem-small',
      'Last Tested: ' + mac.lastTested +
      (mac.reportCount ? ` (${mac.reportCount} reports)` : '')));
  }

  const macVersions = data.versions.filter((v) => v.platform === 'macOS').slice(0, 3);
  if (macVersions.length > 0) {
    const table = el('div', 'crostem-versions');
    for (const v of macVersions) {
      const row = el('div', 'crostem-version-row' +
        (v.version.startsWith('26.') ? ' crostem-version-current' : ''));
      row.appendChild(el('span', 'crostem-version-label', v.version));
      row.appendChild(starsEl(v.stars));
      table.appendChild(row);
    }
    body.appendChild(table);
  }

  const footer = el('div', 'crostem-footer');
  footer.appendChild(linkEl(appUrl(opts.slug), 'View on CodeWeavers ↗'));
  if (opts.approximate && opts.cwName) {
    footer.appendChild(el('div', 'crostem-muted crostem-small',
      `Approximate match: “${opts.cwName}”`));
  }
  if (opts.onChangeMatch) {
    const change = el('a', 'crostem-link crostem-small', 'Wrong match?') as HTMLAnchorElement;
    change.href = '#';
    change.addEventListener('click', (e) => {
      e.preventDefault();
      opts.onChangeMatch!();
    });
    footer.appendChild(change);
  }
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
  const root = box('CrossOver · macOS');
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
