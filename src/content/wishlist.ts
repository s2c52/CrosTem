// Wishlist de Steam: badge automático de CrossOver por fila. La wishlist es
// una SPA de React con clases ofuscadas, así que en vez de depender de clases
// buscamos enlaces a /app/<id> que lleven el título como texto. El flag de
// Mac nativo llega vía la API appdetails de Steam (resuelto en lib/auto).
import { attach } from '../lib/auto';
import '../styles.css';

const APP_LINK = /\/app\/(\d+)/;

function looksLikeTitleLink(a: HTMLAnchorElement): boolean {
  if (a.dataset.crostem) return false;
  if (a.closest('.crostem-box, .crostem-badge, .crostem-overlay')) return false;
  const href = a.getAttribute('href') ?? '';
  if (!APP_LINK.test(href)) return false;
  const text = a.textContent?.trim() ?? '';
  // Descarta enlaces de solo icono/imagen y contenedores enormes.
  return text.length >= 2 && text.length <= 150;
}

function scan(): void {
  document.querySelectorAll<HTMLAnchorElement>('a[href*="/app/"]').forEach((a) => {
    if (!looksLikeTitleLink(a)) return;
    a.dataset.crostem = '1';

    const badge = document.createElement('span');
    badge.className = 'crostem-badge';
    a.insertAdjacentElement('afterend', badge);

    attach(badge, {
      appid: (a.getAttribute('href') ?? '').match(APP_LINK)![1],
      name: a.textContent!.trim(),
      mode: 'inline',
    });
  });
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

scan();
new MutationObserver(scheduleScan).observe(document.body, { childList: true, subtree: true });
