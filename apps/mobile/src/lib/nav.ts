import { router, type Href } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Linking, Platform, Share } from 'react-native';

/** Ouvre une route de l'application à partir d'un chemin (liens calculés par l'API, ex. « /chantiers/…/taches »). */
export function go(path: string): void {
  router.push(path as Href);
}

/** Ouvre un fichier ou une page : onglet sur le web, navigateur intégré sur téléphone. */
export async function openUrl(url: string): Promise<void> {
  if (Platform.OS === 'web') {
    window.open(url, '_blank');
    return;
  }
  try {
    await WebBrowser.openBrowserAsync(url);
  } catch {
    Linking.openURL(url);
  }
}

/** Partage natif d'un lien ; sur le web, copie dans le presse-papiers. Renvoie ce qui s'est passé, pour le dire. */
export async function shareLink(url: string, title: string): Promise<'shared' | 'copied' | 'failed'> {
  if (Platform.OS === 'web') {
    try {
      const nav = globalThis.navigator as Navigator | undefined;
      if (nav?.share) {
        await nav.share({ title, url });
        return 'shared';
      }
      await nav?.clipboard?.writeText(url);
      return 'copied';
    } catch {
      return 'failed';
    }
  }
  try {
    await Share.share({ message: `${title}\n${url}`, url, title });
    return 'shared';
  } catch {
    return 'failed';
  }
}
