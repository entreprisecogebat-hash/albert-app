import * as Location from 'expo-location';

export interface Fix {
  latitude: number;
  longitude: number;
  accuracy: number | null;
}

/**
 * Position pour le pointage. Jamais bloquante : sans autorisation ou sans signal
 * au bout de 8 secondes, on pointe quand même, sans position.
 */
export async function currentFix(): Promise<Fix | null> {
  try {
    const p = await Location.requestForegroundPermissionsAsync();
    if (!p.granted) return null;
    const last = await Location.getLastKnownPositionAsync({ maxAge: 60_000, requiredAccuracy: 100 });
    const pos = last ?? (await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((r) => setTimeout(() => r(null), 8000)),
    ]));
    if (!pos) return null;
    return { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy ?? null };
  } catch {
    return null;
  }
}
