// Popup del toolbar: buscador manual contra CodeWeavers (útil fuera de
// Steam) + acceso a los ajustes. Usa el mismo cliente/caché que el resto.
import { appUrl, search } from '../lib/client';
import { t } from '../lib/i18n';

const queryEl = document.getElementById('query') as HTMLInputElement;
const resultsEl = document.getElementById('results')!;
const optionsLink = document.getElementById('open-options') as HTMLAnchorElement;

queryEl.placeholder = t('popupSearchPlaceholder');
optionsLink.textContent = t('popupOptions');
optionsLink.addEventListener('click', (e) => {
  e.preventDefault();
  void chrome.runtime.openOptionsPage();
});

function starsSpan(n: number | null): HTMLElement {
  const span = document.createElement('span');
  if (n == null) {
    span.textContent = '—';
    return span;
  }
  const filled = document.createElement('span');
  filled.className = 'stars-filled';
  filled.textContent = '★'.repeat(n);
  const empty = document.createElement('span');
  empty.className = 'stars-empty';
  empty.textContent = '☆'.repeat(Math.max(0, 5 - n));
  span.append(filled, empty);
  return span;
}

let timer: ReturnType<typeof setTimeout> | undefined;
let lastQuery = '';

async function runSearch(q: string): Promise<void> {
  lastQuery = q;
  resultsEl.textContent = '';
  if (q.trim().length < 2) return;
  const loading = document.createElement('div');
  loading.className = 'muted';
  loading.textContent = '…';
  resultsEl.appendChild(loading);
  try {
    const results = await search(q);
    if (lastQuery !== q) return; // llegó tarde: hay una búsqueda más nueva
    resultsEl.textContent = '';
    if (results.length === 0) {
      const none = document.createElement('div');
      none.className = 'muted';
      none.textContent = t('popupNoResults');
      resultsEl.appendChild(none);
      return;
    }
    for (const r of results.slice(0, 8)) {
      const a = document.createElement('a');
      a.className = 'result';
      a.href = appUrl(r.slug);
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = r.name;
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.appendChild(starsSpan(r.stars));
      meta.appendChild(document.createTextNode(r.company ? ` · ${r.company}` : ''));
      a.append(name, meta);
      resultsEl.appendChild(a);
    }
  } catch {
    if (lastQuery !== q) return;
    resultsEl.textContent = '';
    const err = document.createElement('div');
    err.className = 'muted';
    err.textContent = t('popupError');
    resultsEl.appendChild(err);
  }
}

queryEl.addEventListener('input', () => {
  clearTimeout(timer);
  timer = setTimeout(() => void runSearch(queryEl.value), 350);
});
