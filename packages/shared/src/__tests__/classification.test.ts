import { describe, expect, it } from 'vitest';
import cases from '../../classification-cases.json';
import { displayTitle, extractVersion, normalizeTitle, previewOffline } from '../classification';

describe('classement : mêmes cas que l’API', () => {
  for (const c of cases.cases) {
    it(c.file, () => {
      expect(displayTitle(c.file)).toBe(c.display);
      expect(normalizeTitle(c.file)).toBe(c.normalized);
      const v = extractVersion(c.file);
      expect([v.number, v.label]).toEqual(c.version);
    });
  }
});

describe('aperçu hors ligne', () => {
  const known = [
    { id: 'd1', title: 'Plan de calepinage', type: 'plan' as const, folder: { kind: 'plans' }, versionsCount: 2, current: { label: 'V2' } },
  ];

  it('reconnaît la V3 d’un plan connu', () => {
    const p = previewOffline('Plan_calepinage_final_v3.pdf', known);
    expect(p.statement).toBe('Albert a reconnu un plan, version 3.');
    expect(p.newVersionOf?.id).toBe('d1');
    expect(p.versionLabel).toBe('V3');
  });

  it('ne réutilise pas un indice déjà dépassé', () => {
    const p = previewOffline('Plan_calepinage_v2.pdf', known);
    expect(p.versionLabel).toBe('V3');
  });

  it('classe un devis inconnu par les règles', () => {
    const p = previewOffline('DEVIS_Toitec.pdf', known);
    expect(p.type).toBe('devis');
    expect(p.folderKind).toBe('devis');
    expect(p.statement).toBe('Albert a reconnu un devis.');
  });

  it('range une image inconnue dans Photos', () => {
    const p = previewOffline('IMG_2041.jpg', [], 'image/jpeg');
    expect(p.folderKind).toBe('photos');
  });
});
