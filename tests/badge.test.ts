// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// Compact badge mode: dot-only rendering for rows too dense for the
// inline badge. The other modes are covered indirectly by the content
// smoke tests; here the contract is the compact structure itself.
import { beforeEach, describe, expect, it } from 'vitest';
import { renderBadge } from '../src/lib/badge';
import { stubChrome } from './chrome-mock';
import { must } from './helpers';
import type { AutoAttachOpts, ResolveResult } from '../src/types';

const COMPACT: AutoAttachOpts = { mode: 'compact' };

const STARS: ResolveResult = {
  kind: 'stars',
  stars: 4,
  slug: 'test-game',
  cwName: 'Test Game',
  approximate: false,
  level: 'green',
};

function host(): HTMLElement {
  const el = document.createElement('span');
  el.className = 'crostem-badge crostem-badge-compact';
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  stubChrome();
  document.body.innerHTML = '';
});

describe('renderBadge compact', () => {
  it('renders native as a single green dot, no stars', () => {
    const el = host();
    renderBadge(el, { kind: 'native', arch: null }, COMPACT);
    const dots = el.querySelectorAll('.crostem-dot');
    expect(dots).toHaveLength(1);
    const dot = must(dots[0], 'dot');
    expect(dot.className).toContain('crostem-dot-green');
    expect(dot.getAttribute('aria-label')).toBe('nativeBadge');
    expect(el.querySelector('.crostem-stars')).toBeNull();
  });

  it('renders a stars result as one dot inside the CodeWeavers link', () => {
    const el = host();
    renderBadge(el, STARS, COMPACT);
    const link = must(el.querySelector<HTMLAnchorElement>('a.crostem-badge-result'), 'cw link');
    expect(link.href).toContain('test-game');
    expect(link.querySelectorAll('.crostem-dot-green')).toHaveLength(1);
    expect(el.querySelectorAll('.crostem-dot')).toHaveLength(1);
    expect(el.querySelector('.crostem-stars')).toBeNull();
  });

  it('renders ambiguous as one dot inside the search link', () => {
    const el = host();
    renderBadge(el, { kind: 'ambiguous', count: 3, query: 'Test', level: 'yellow' }, COMPACT);
    const link = must(el.querySelector<HTMLAnchorElement>('a.crostem-badge-result'), 'search link');
    expect(link.querySelectorAll('.crostem-dot-yellow')).toHaveLength(1);
    // No "N matches" text in compact mode: the dot is the whole badge.
    expect(el.textContent).toBe('');
  });

  it('renders a dot result with the verdict aria-label', () => {
    const el = host();
    renderBadge(el, { kind: 'dot', level: 'red' }, COMPACT);
    const dot = must(el.querySelector('.crostem-dot-red'), 'dot');
    expect(dot.getAttribute('aria-label')).toBe('verdict_red');
  });

  it('removes the element entirely on a none result', () => {
    const el = host();
    renderBadge(el, { kind: 'none' }, COMPACT);
    expect(el.isConnected).toBe(false);
  });

  it('attaches the rich tooltip to compact badges', () => {
    const el = host();
    renderBadge(el, STARS, COMPACT);
    el.dispatchEvent(new Event('mouseenter'));
    const tip = must(document.querySelector('.crostem-tooltip'), 'tooltip');
    expect(tip.className).toContain('crostem-tooltip-green');
  });

  it('leaves the inline mode untouched: stars still render as stars', () => {
    const el = host();
    renderBadge(el, STARS, { mode: 'inline' });
    expect(el.querySelector('.crostem-stars')).not.toBeNull();
  });
});
