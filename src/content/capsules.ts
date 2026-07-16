// Overlay de estrellas sobre las cápsulas (imágenes) de juego en toda la
// tienda de Steam: portada, ofertas, categorías, "more like this", etc.
import { attach } from '../lib/auto';
import { getSettings } from '../lib/settings';
import '../styles.css';

const APP_LINK = /\/app\/(\d+)/;

function nameHint(a: HTMLAnchorElement): string | null {
  const img = a.querySelector<HTMLImageElement>('img[alt]');
  if (img && img.alt.trim().length > 1) return img.alt.trim();
  const aria = a.getAttribute('aria-label');
  if (aria && aria.trim().length > 1) return aria.trim();
  if (a.title && a.title.trim().length > 1) return a.title.trim();
  const tabName = a.querySelector('.tab_item_name');
  return tabName?.textContent?.trim() || null;
}

function processAnchor(a: HTMLAnchorElement): void {
  if (a.dataset.crostemCapsule) return;
  if (a.classList.contains('search_result_row')) return; // ya lleva badge inline
  if (a.closest('.crostem-box, .crostem-badge, .crostem-overlay')) return;

  const m = (a.getAttribute('href') ?? '').match(APP_LINK);
  if (!m) return;
  if (!a.querySelector('img, picture')) return; // solo cápsulas con imagen

  a.dataset.crostemCapsule = '1';
  a.classList.add('crostem-capsule-host');

  const overlay = document.createElement('span');
  overlay.className = 'crostem-overlay';
  a.appendChild(overlay);

  attach(overlay, { appid: m[1], name: nameHint(a), mode: 'overlay' });
}

function scan(): void {
  document.querySelectorAll<HTMLAnchorElement>('a[href*="/app/"]').forEach(processAnchor);
}

let scheduled = false;
function scheduleScan(): void {
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => {
    scheduled = false;
    scan();
  }, 300);
}

// Las filas de la wishlist llevan su propio badge inline (content/wishlist.ts);
// superponer también sus cápsulas duplicaría la información.
if (!location.pathname.startsWith('/wishlist')) {
  void (async () => {
    if (!(await getSettings()).surfaces.capsules) return;
    scan();
    new MutationObserver(scheduleScan).observe(document.body, { childList: true, subtree: true });
  })();
}
