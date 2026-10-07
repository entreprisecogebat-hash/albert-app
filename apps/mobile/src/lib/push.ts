import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { api } from './api';

/**
 * Expo Go (Android) ne fournit plus les notifications distantes depuis le SDK 53 : le simple import
 * d'expo-notifications y lève une erreur et ferait tomber toute l'application. Le module n'est donc
 * chargé qu'à la demande, et jamais dans Expo Go ni dans le navigateur.
 */
const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

type NotificationsModule = typeof import('expo-notifications');
let handlerSet = false;

function loadNotifications(): NotificationsModule | null {
  if (Platform.OS === 'web' || inExpoGo) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const N = require('expo-notifications') as NotificationsModule;
    if (!handlerSet) {
      N.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });
      handlerSet = true;
    }
    return N;
  } catch {
    return null;
  }
}

/**
 * Enregistre le téléphone pour les notifications (F-21), via le service Expo qui relaie
 * vers APNs et FCM. Nécessite un appareil réel, une version compilée de l'app (pas Expo Go)
 * et un projet EAS (extra.eas.projectId) : sinon, on passe simplement.
 */
export async function registerForPush(): Promise<void> {
  if (!Device.isDevice) return;
  const Notifications = loadNotifications();
  if (!Notifications) return;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return;

  const current = await Notifications.getPermissionsAsync();
  let granted = current.granted;
  if (!granted && current.canAskAgain) {
    granted = (await Notifications.requestPermissionsAsync()).granted;
  }
  if (!granted) return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Chantiers',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await api.account.registerDevice(token, Platform.OS === 'ios' ? 'ios' : 'android');
}
