import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Enregistre le téléphone pour les notifications (F-21), via le service Expo qui relaie
 * vers APNs et FCM. Nécessite un appareil réel et un projet EAS (extra.eas.projectId) :
 * en développement sur simulateur ou dans le navigateur, on passe simplement.
 */
export async function registerForPush(): Promise<void> {
  if (Platform.OS === 'web' || !Device.isDevice) return;
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
