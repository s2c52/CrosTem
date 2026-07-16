// Resultados de búsqueda de Steam: badge automático de CrossOver por fila
// (carga cuando la fila se hace visible, vía el observer de lib/auto).
import { attach } from '../lib/auto';
import { getSettings } from '../lib/settings';
import '../styles.css';

function processRow(row: HTMLElement): void {
  if (row.dataset.crostem) return;
  row.dataset.crostem = '1';

  const titleEl = row.querySelector('.search_name .title');
  const name = titleEl?.textContent?.trim();
  if (!titleEl || !name) return;

  const badge = document.createElement('span');
  badge.className = 'crostem-badge';
  titleEl.insertAdjacentElement('afterend', badge);

  // Las filas de búsqueda siempre muestran iconos de plataforma: la ausencia
  // del icono Mac es señal fiable de "no nativo".
  attach(badge, {
    appid: row.getAttribute('data-ds-appid'),
    name,
    native: !!row.querySelector('.platform_img.mac'),
    mode: 'inline',
  });
}

function scan(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('a.search_result_row').forEach(processRow);
}

void (async () => {
  if (!(await getSettings()).surfaces.search) return;
  scan();

  // Steam carga más filas por AJAX (scroll infinito / paginación).
  const resultsContainer = document.getElementById('search_resultsRows') ??
    document.getElementById('search_results') ?? document.body;
  new MutationObserver(() => scan(resultsContainer))
    .observe(resultsContainer, { childList: true, subtree: true });
})();
