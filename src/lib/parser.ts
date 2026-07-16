// Parsers for CodeWeavers HTML. All scraping lives here so that a site
// redesign only requires touching this file.
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
  return {
    stars: starsFrom(box),
    status,
    lastTested: m ? m[1] : null,
    reportCount: m?.[2] ? parseInt(m[2], 10) : null,
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
    const vm = text.match(/(\d+(?:\.\d+)+)/);
    if (!vm) return;
    const platform: CwVersionRating['platform'] = header.querySelector('.fa-apple')
      ? 'macOS'
      : header.querySelector('.fa-linux') || /linux/i.test(text)
        ? 'Linux'
        : 'macOS';
    result.versions.push({ version: vm[1], platform, stars: starsFrom(header) });
  });

  // Aggregate rating from the JSON-LD, if present.
  doc.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
    if (result.aggregate) return;
    try {
      const data = JSON.parse(s.textContent ?? '');
      const nodes: any[] = data['@graph'] ?? [data];
      for (const node of nodes) {
        if (node?.aggregateRating) {
          result.aggregate = {
            value: Number(node.aggregateRating.ratingValue),
            count: Number(node.aggregateRating.ratingCount),
          };
          break;
        }
      }
    } catch {
      // Malformed JSON-LD: ignored
    }
  });

  return result;
}
