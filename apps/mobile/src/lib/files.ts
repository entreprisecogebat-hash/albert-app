import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

const toHex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

/** Empreinte SHA-256, calculée sur le téléphone : Albert reconnaît un doublon avant tout envoi. */
export async function sha256OfUri(uri: string): Promise<string | null> {
  try {
    if (Platform.OS === 'web') {
      const buf = await (await fetch(uri)).arrayBuffer();
      return toHex(await crypto.subtle.digest('SHA-256', buf));
    }
    const bytes = await new File(uri).bytes();
    return toHex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes));
  } catch {
    return null;
  }
}

/**
 * Copie le fichier choisi dans le dossier de l'application : il survit à la fermeture
 * de l'application et au nettoyage du cache, le temps que le réseau revienne.
 * Sur le web (banc d'essai), l'URI blob reste valable tant que la page est ouverte.
 */
export function keepForUpload(uri: string, entryId: string, filename: string): string {
  if (Platform.OS === 'web') return uri;
  const dir = new Directory(Paths.document, 'outbox', entryId);
  if (!dir.exists) dir.create({ intermediates: true });
  const safe = filename.replace(/[\\/:*?"<>|]+/g, '_') || 'fichier';
  const dest = new File(dir, safe);
  if (!dest.exists) new File(uri).copy(dest);
  return dest.uri;
}

/** Supprime la copie locale une fois le fichier reçu par le serveur. */
export function forgetUpload(entryId: string): void {
  if (Platform.OS === 'web') return;
  try {
    const dir = new Directory(Paths.document, 'outbox', entryId);
    if (dir.exists) dir.delete();
  } catch {
    /* rien de grave : le fichier sera écrasé ou nettoyé plus tard */
  }
}

/** Ajoute le fichier au formulaire d'envoi, sur téléphone comme sur le web. */
export async function appendFile(form: FormData, uri: string, filename: string, mimeType: string): Promise<void> {
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    form.append('file', new globalThis.File([blob], filename, { type: mimeType }));
    return;
  }
  // expo-file-system File implémente l'interface Blob
  form.append('file', new File(uri) as unknown as Blob, filename);
}
