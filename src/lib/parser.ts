// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Parsers for CodeWeavers HTML. All scraping lives here so that a site
// redesign only requires touching this file.
import { isRecord } from './guards';
import { logDebug } from './log';
import type { CwAppPage, CwRatingBox, CwSearchResult, CwVersionRating } from '../types';

function parseDoc(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

// <ul class="star-rating-table"> with one li.active per filled star.
function starsFrom(container: Element | Document | null): number | null {
  const ul = container?.querySelector('ul.star-rating-table');
  if (!ul) return null;
  return ul.querySelectorAll('li.active').length;
}

function textOf(el: Element | null): string {
  return el ? (el.textContent ?? '').replace(/\s+/g, ' ').trim() : '';
}

// Search: https://www.codeweavers.com/compatibility?name=<query>
// Table #teTable-app: | Application | Company | Last Updated | Rating (Mac) |
export function parseSearchResults(html: string): CwSearchResult[] {
  const doc = parseDoc(html);
  const rows = doc.querySelectorAll('#teTable-app tbody tr');
  const results: CwSearchResult[] = [];
  rows.forEach((tr) => {
    const link = tr.querySelector('a[href^="/compatibility/crossover/"]');
    if (!link) return;
    const slug = (link.getAttribute('href') ?? '').split('/').filter(Boolean).pop() ?? '';
    const tds = tr.querySelectorAll('td');
    results.push({
      name: textOf(link),
      slug,
      company: textOf(tds[1] ?? null),
      lastUpdated: textOf(tds[2] ?? null),
      stars: starsFrom(tr),
    });
  });
  return results;
}

function parseRatingBox(box: Element | null): CwRatingBox | null {
  if (!box) return null;
  // span.txt_yellow carries the status text; the Linux heading (h3)
  // also has .txt_yellow, so the selector must be specific.
  const status = textOf(box.querySelector('span.txt_yellow'));
  const small = textOf(box.querySelector('.small'));
  const m = small.match(/Last Tested:\s*([\d.]+)\s*(?:\((\d+)\))?/i);
  const count = m?.[2];
  return {
    stars: starsFrom(box),
    status,
    lastTested: m?.[1] ?? null,
    reportCount: count ? parseInt(count, 10) : null,
  };
}

// App page: https://www.codeweavers.com/compatibility/crossover/<slug>
export function parseAppPage(html: string): CwAppPage | null {
  const doc = parseDoc(html);
  const ratingRoot = doc.querySelector('#appRating');
  if (!ratingRoot) return null;

  const result: CwAppPage = {
    slug: textOf(doc.querySelector('#var_app_plnk')) || null,
    mac: parseRatingBox(ratingRoot.querySelector('.os_Mac')),
    linux: parseRatingBox(ratingRoot.querySelector('.os_Linux')),
    versions: [],
    aggregate: null,
  };

  // Breakdown by CrossOver version (#breakdown), most recent first.
  doc.querySelectorAll('#breakdown .breakdown-row .card-header').forEach((header) => {
    const text = textOf(header);
    const version = text.match(/(\d+(?:\.\d+)+)/)?.[1];
    if (!version) return;
    const platform: CwVersionRating['platform'] = header.querySelector('.fa-apple')
      ? 'macOS'
      : header.querySelector('.fa-linux') || /linux/i.test(text)
        ? 'Linux'
        : 'macOS';
    result.versions.push({ version, platform, stars: starsFrom(header) });
  });

  // Aggregate rating from the JSON-LD, if present.
  doc.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
    if (result.aggregate) return;
    try {
      const data: unknown = JSON.parse(s.textContent ?? '');
      const graph = isRecord(data) ? data['@graph'] : undefined;
      const nodes: unknown[] = Array.isArray(graph) ? graph : [data];
      for (const node of nodes) {
        if (!isRecord(node)) continue;
        const agg = node.aggregateRating;
        if (isRecord(agg)) {
          result.aggregate = {
            value: Number(agg.ratingValue),
            count: Number(agg.ratingCount),
          };
          break;
        }
      }
    } catch (e) {
      // Malformed JSON-LD: ignored.
      logDebug('malformed JSON-LD ignored', e);
    }
  });

  return result;
}
