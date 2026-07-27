// Copyright (C) 2026 Sacha Gennari
// SPDX-License-Identifier: GPL-3.0-or-later

// The URL allowlist is the service worker's security boundary: every
// external fetch a content script can request goes through it.
import { describe, expect, it } from 'vitest';
import { isAllowedUrl } from '../src/lib/allowlist';

describe('isAllowedUrl', () => {
  it('acepta los cuatro endpoints reales', () => {
    expect(isAllowedUrl('https://www.codeweavers.com/compatibility?name=elden')).toBe(true);
    expect(isAllowedUrl('https://www.codeweavers.com/compatibility/crossover/elden-ring')).toBe(
      true,
    );
    expect(isAllowedUrl('https://www.applegamingwiki.com/w/api.php?action=cargoquery')).toBe(true);
    expect(
      isAllowedUrl(
        'https://raw.githubusercontent.com/AreWeAntiCheatYet/AreWeAntiCheatYet/HEAD/games.json',
      ),
    ).toBe(true);
    expect(
      isAllowedUrl(
        'https://store.steampowered.com/api/appdetails?appids=620&filters=platforms&l=english',
      ),
    ).toBe(true);
  });

  it('de Steam sólo abre appdetails, no el resto de la tienda', () => {
    expect(isAllowedUrl('https://store.steampowered.com/app/440')).toBe(false);
    expect(isAllowedUrl('https://store.steampowered.com/api/appuserdetails?appids=440')).toBe(
      false,
    );
    expect(isAllowedUrl('https://store.steampowered.com/wishlist/')).toBe(false);
    // The community origin is injected into, never fetched through the worker.
    expect(isAllowedUrl('https://steamcommunity.com/id/x/games')).toBe(false);
  });

  it('rechaza otros hosts, paths y esquemas', () => {
    expect(isAllowedUrl('https://evil.example.com/compatibility')).toBe(false);
    expect(isAllowedUrl('https://www.codeweavers.com/account')).toBe(false);
    expect(isAllowedUrl('https://raw.githubusercontent.com/Other/repo/HEAD/games.json')).toBe(
      false,
    );
    expect(isAllowedUrl('http://www.codeweavers.com/compatibility')).toBe(false);
    expect(isAllowedUrl('ftp://www.codeweavers.com/compatibility')).toBe(false);
  });

  it('rechaza hosts lookalike, userinfo y path traversal', () => {
    expect(isAllowedUrl('https://www.codeweavers.com.evil.com/compatibility')).toBe(false);
    expect(isAllowedUrl('https://evil.com/www.codeweavers.com/compatibility')).toBe(false);
    expect(isAllowedUrl('https://www.codeweavers.com@evil.com/compatibility')).toBe(false);
    expect(isAllowedUrl('https://raw.githubusercontent.com/AreWeAntiCheatYet/../Other/x')).toBe(
      false,
    );
  });

  it('rechaza entradas que no son URL', () => {
    expect(isAllowedUrl('')).toBe(false);
    expect(isAllowedUrl('not a url')).toBe(false);
    expect(isAllowedUrl('javascript:alert(1)')).toBe(false);
  });
});
