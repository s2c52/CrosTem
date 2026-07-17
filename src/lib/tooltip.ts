// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Rich hover tooltip for store-wide badges: a lazily-created singleton
// mini-card (verdict strip + stars + detail lines) positioned near the
// anchor, clamped to the viewport. Keyboard-friendly (focus shows it).
import { starsEl } from './widget';
import type { VerdictLevel } from '../types';

export interface TooltipData {
  level: VerdictLevel;
  title: string;
  stars?: number | null;
  lines?: string[];
}

const MARGIN = 8;

let tip: HTMLElement | null = null;
let currentAnchor: Element | null = null;

function ensureTip(): HTMLElement {
  if (tip) return tip;
  tip = document.createElement('div');
  tip.className = 'crostem-tooltip';
  tip.setAttribute('role', 'tooltip');
  tip.setAttribute('aria-hidden', 'true');
  document.body.appendChild(tip);
  // One global listener pair: any scroll or resize hides the tooltip.
  document.addEventListener('scroll', hide, { passive: true, capture: true });
  window.addEventListener('resize', hide, { passive: true });
  return tip;
}

function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function show(anchor: Element, data: TooltipData): void {
  const node = ensureTip();
  currentAnchor = anchor;
  node.textContent = '';
  node.className = 'crostem-tooltip crostem-tooltip-' + data.level;
  node.appendChild(el('div', 'crostem-tooltip-title', data.title));
  if (data.stars !== undefined) {
    const line = el('div', 'crostem-tooltip-stars');
    line.appendChild(starsEl(data.stars));
    node.appendChild(line);
  }
  for (const text of data.lines ?? []) {
    node.appendChild(el('div', 'crostem-muted crostem-small', text));
  }

  // Measure, then place above the anchor (below when there is no room),
  // horizontally centered and clamped to the viewport.
  node.style.visibility = 'hidden';
  node.classList.add('crostem-tooltip-visible');
  const rect = anchor.getBoundingClientRect();
  const tipRect = node.getBoundingClientRect();
  let left = rect.left + rect.width / 2 - tipRect.width / 2;
  left = Math.max(MARGIN, Math.min(left, window.innerWidth - tipRect.width - MARGIN));
  let top = rect.top - tipRect.height - MARGIN;
  if (top < MARGIN) top = rect.bottom + MARGIN;
  node.style.left = `${left}px`;
  node.style.top = `${top}px`;
  node.style.visibility = '';
  node.setAttribute('aria-hidden', 'false');
}

function hide(): void {
  currentAnchor = null;
  if (!tip) return;
  tip.classList.remove('crostem-tooltip-visible');
  tip.setAttribute('aria-hidden', 'true');
}

/** Wire the tooltip to an anchor element (mouse + keyboard focus). */
export function attachTooltip(anchor: HTMLElement, data: TooltipData): void {
  anchor.addEventListener('mouseenter', () => show(anchor, data));
  anchor.addEventListener('mouseleave', () => {
    if (currentAnchor === anchor) hide();
  });
  anchor.addEventListener('focusin', () => show(anchor, data));
  anchor.addEventListener('focusout', () => {
    if (currentAnchor === anchor) hide();
  });
}
