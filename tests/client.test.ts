// Parseo puro de la respuesta appdetails de Steam (fixture representativa:
// juego nativo con requisitos HTML, no-nativo con mac_requirements=[] y
// appid desconocido con success=false).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSteamDetails } from '../src/lib/client';

const json = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'steam_appdetails.json'), 'utf8'));

describe('parseSteamDetails', () => {
  it('extrae nombre, flag mac, requisitos sin HTML y año', () => {
    const d = parseSteamDetails(json, '1086940')!;
    expect(d.name).toBe("Baldur's Gate 3");
    expect(d.mac).toBe(true);
    expect(d.macRequirements).toContain('Apple Silicon M1');
    expect(d.macRequirements).toContain('M2 Pro');
    expect(d.macRequirements).not.toMatch(/<[^>]*>/);
    expect(d.releaseYear).toBe(2023);
  });

  it('no-nativo: mac_requirements=[] tolerado y sin requisitos guardados', () => {
    const d = parseSteamDetails(json, '440')!;
    expect(d.mac).toBe(false);
    expect(d.macRequirements).toBeNull();
    expect(d.releaseYear).toBe(2007);
  });

  it('success=false → null', () => {
    expect(parseSteamDetails(json, '999999')).toBeNull();
  });

  it('appid ausente o respuesta rara → null', () => {
    expect(parseSteamDetails(json, '123')).toBeNull();
    expect(parseSteamDetails(null, '1')).toBeNull();
    expect(parseSteamDetails({}, '1')).toBeNull();
  });

  it('sin release_date ni requisitos → campos null', () => {
    const d = parseSteamDetails({ '7': { success: true, data: { name: 'X', platforms: { mac: true } } } }, '7')!;
    expect(d).toMatchObject({ name: 'X', mac: true, macRequirements: null, releaseYear: null });
  });
});
