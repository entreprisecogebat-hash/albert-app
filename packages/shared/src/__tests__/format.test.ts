import { describe, expect, it } from 'vitest';
import * as fmt from '../format';

const now = new Date(2026, 9, 2, 9, 54); // vendredi 2 octobre 2026, 9:54

describe('dates du fil', () => {
  it('relatives', () => {
    expect(fmt.relative(new Date(2026, 9, 2, 9, 42), now)).toBe('Il y a 12 min');
    expect(fmt.relative(new Date(2026, 9, 2, 7, 40), now)).toBe('Il y a 2 h');
    expect(fmt.relative(new Date(2026, 9, 1, 17, 24), now)).toBe('Hier, 17:24');
    expect(fmt.relative(new Date(2026, 8, 28, 9, 15), now)).toBe('Lundi');
    expect(fmt.relative(new Date(2026, 8, 3, 16, 2), now)).toBe('3 septembre');
    expect(fmt.relative(new Date(2026, 4, 1, 16, 2), now)).toBe('1er mai');
  });

  it('exactes, pour la preuve', () => {
    expect(fmt.exact(new Date(2026, 8, 22, 9, 14), now)).toBe('le 22 septembre à 9:14');
  });

  it('plage de prise de vue', () => {
    expect(fmt.takenRange(new Date(2026, 9, 2, 9, 42).toISOString(), new Date(2026, 9, 2, 9, 47).toISOString())).toBe('prises entre 9:42 et 9:47');
  });
});

describe('tailles et numéros', () => {
  it('octets', () => {
    expect(fmt.bytes(4.2 * 1024 * 1024)).toBe('4,2 Mo');
    expect(fmt.bytes(820 * 1024)).toBe('820 Ko');
  });
  it('téléphone', () => {
    expect(fmt.normalizePhone('06 12 34 56 78')).toBe('+33612345678');
    expect(fmt.formatPhone('+33612345678')).toBe('+33 6 12 34 56 78');
    expect(fmt.normalizePhone('12')).toBeNull();
  });
});
