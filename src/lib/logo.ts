// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// CT monogram logo, built programmatically (no innerHTML anywhere in this
// codebase — keeps us safe under strict page CSP / Trusted Types).

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

let gradientSeq = 0;

/**
 * CrosTem "CT" monogram as an inline SVG element.
 * Rounded Steam-gradient tile with the C in accent blue and the T in star
 * gold — the two colors the product is known by.
 */
export function ctLogo(size = 16): SVGSVGElement {
  const svg = svgEl('svg', {
    viewBox: '0 0 32 32',
    width: String(size),
    height: String(size),
    role: 'img',
    'aria-hidden': 'true',
    class: 'crostem-logo',
  });

  // Unique gradient id per instance: several logos can coexist in one page.
  const gradId = `ct-logo-bg-${++gradientSeq}`;
  const defs = svgEl('defs', {});
  const grad = svgEl('linearGradient', { id: gradId, x1: '0', y1: '0', x2: '1', y2: '1' });
  grad.appendChild(svgEl('stop', { offset: '0', 'stop-color': '#2a475e' }));
  grad.appendChild(svgEl('stop', { offset: '1', 'stop-color': '#16202d' }));
  defs.appendChild(grad);
  svg.appendChild(defs);

  svg.appendChild(svgEl('rect', { width: '32', height: '32', rx: '7', fill: `url(#${gradId})` }));
  svg.appendChild(
    svgEl('rect', {
      x: '0.75',
      y: '0.75',
      width: '30.5',
      height: '30.5',
      rx: '6.25',
      fill: 'none',
      stroke: '#3d5a80',
      'stroke-width': '1.5',
    }),
  );

  // "C" — open arc, Steam accent blue.
  svg.appendChild(
    svgEl('path', {
      d: 'M 18.5 9.5 A 7.5 7.5 0 1 0 18.5 22.5',
      fill: 'none',
      stroke: '#66c0f4',
      'stroke-width': '3.4',
      'stroke-linecap': 'round',
    }),
  );

  // "T" — star gold, nested in the C's mouth.
  const t = svgEl('g', {
    stroke: '#ffc82c',
    'stroke-width': '3.2',
    'stroke-linecap': 'round',
    fill: 'none',
  });
  t.appendChild(svgEl('path', { d: 'M 17.5 12.5 H 26.5' }));
  t.appendChild(svgEl('path', { d: 'M 22 12.5 V 23' }));
  svg.appendChild(t);

  return svg;
}
