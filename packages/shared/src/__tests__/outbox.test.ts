import { describe, expect, it } from 'vitest';
import { ApiError } from '../api';
import { Outbox, outboxSentence, type OutboxEntry } from '../outbox';

function memoryStorage() {
  let saved: OutboxEntry[] = [];
  return { load: async () => saved, save: async (e: OutboxEntry[]) => void (saved = JSON.parse(JSON.stringify(e))), peek: () => saved };
}

describe('file hors ligne', () => {
  it('garde les actions sans réseau puis les envoie dans l’ordre', async () => {
    const storage = memoryStorage();
    let online = false;
    const sent: string[] = [];
    const box = new Outbox(storage, async (e) => {
      if (!online) throw new ApiError(0, { error: 'Pas de réseau', code: 'network' });
      sent.push(e.id);
    });
    await box.add({ id: 'a', kind: 'photo', siteId: 's', payload: {} });
    await box.add({ id: 'b', kind: 'message', siteId: 's', payload: {} });
    await box.flush();
    expect(box.state().pending).toBe(2);
    expect(storage.peek()).toHaveLength(2);
    expect(outboxSentence(box.state(), false)).toBe('2 éléments en attente de réseau. Envoi automatique dès que vous captez.');

    online = true;
    await box.flush();
    expect(sent).toEqual(['a', 'b']);
    expect(box.state().pending).toBe(0);
    expect(outboxSentence(box.state(), true)).toBeNull();
  });

  it('n’ajoute pas deux fois la même action', async () => {
    const box = new Outbox(memoryStorage(), async () => {});
    await box.add({ id: 'a', kind: 'photo', siteId: 's', payload: {} });
    await box.add({ id: 'a', kind: 'photo', siteId: 's', payload: {} });
    expect(box.state().pending).toBe(1);
  });

  it('met de côté une action refusée par le serveur sans bloquer les suivantes', async () => {
    const sent: string[] = [];
    const box = new Outbox(memoryStorage(), async (e) => {
      if (e.id === 'bad') throw new ApiError(422, { error: 'Ce fichier dépasse 50 Mo.', code: 'validation' });
      sent.push(e.id);
    });
    await box.add({ id: 'bad', kind: 'document', siteId: 's', payload: {} });
    await box.add({ id: 'ok', kind: 'message', siteId: 's', payload: {} });
    await box.flush();
    expect(sent).toEqual(['ok']);
    expect(box.state().failed).toBe(1);
    expect(box.state().entries[0]?.lastError).toBe('Ce fichier dépasse 50 Mo.');
  });
});
