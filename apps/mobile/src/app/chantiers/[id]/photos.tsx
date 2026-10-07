import { fmt, uuid } from '@albert/shared';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { Camera, Images, MapPin, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { api } from '../../../lib/api';
import { keepForUpload } from '../../../lib/files';
import { useOnline } from '../../../lib/network';
import { enqueue, useOutbox, type PhotoPayload } from '../../../lib/outbox';
import { Button, ErrorText, Field, NetBanner, Screen, VisibilitySeg } from '../../../ui/components';
import { colors, radius, space, t } from '../../../ui/theme';

interface Shot {
  uri: string;
  filename: string;
  mimeType: string;
  takenAt: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
}

/** "2026:10:02 09:42:13" (EXIF) -> Date */
function exifDate(exif: Record<string, unknown> | null | undefined): Date | null {
  const raw = (exif?.DateTimeOriginal ?? exif?.DateTime) as string | undefined;
  const m = raw ? /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(raw) : null;
  return m ? new Date(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!) : null;
}

function exifGps(exif: Record<string, unknown> | null | undefined): { lat: number; lng: number } | null {
  const lat = exif?.GPSLatitude as number | undefined;
  const lng = exif?.GPSLongitude as number | undefined;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  return { lat: exif?.GPSLatitudeRef === 'S' ? -lat : lat, lng: exif?.GPSLongitudeRef === 'W' ? -lng : lng };
}

/**
 * Photos horodatées et géolocalisées (F-09). L'heure et la position sont celles de la prise,
 * pas de l'envoi : une photo prise au sous-sol à 9:42 reste datée de 9:42.
 */
export default function PhotosScreen() {
  const { id, source } = useLocalSearchParams<{ id: string; source?: 'camera' | 'library' }>();
  const online = useOnline();
  const { outbox } = useOutbox();
  const site = useQuery({ queryKey: ['site', id], queryFn: () => api.sites.get(id) });
  const [shots, setShots] = useState<Shot[]>([]);
  const [caption, setCaption] = useState('');
  const [visibility, setVisibility] = useState<'team' | 'client'>('team');
  const [locStatus, setLocStatus] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const started = useRef(false);

  async function position(): Promise<Location.LocationObject | null> {
    try {
      let status = locStatus;
      if (status === 'unknown') {
        const p = await Location.requestForegroundPermissionsAsync();
        status = p.granted ? 'granted' : 'denied';
        setLocStatus(status);
      }
      if (status !== 'granted') return null;
      // Position récente acceptée ; sinon un relevé rapide, sans bloquer la prise de vue.
      const last = await Location.getLastKnownPositionAsync({ maxAge: 120_000, requiredAccuracy: 100 });
      if (last) return last;
      return await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<null>((r) => setTimeout(() => r(null), 6000)),
      ]);
    } catch {
      return null;
    }
  }

  async function add(from: 'camera' | 'library') {
    setError(null);
    const perm = from === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError(from === 'camera' ? "Albert n'a pas accès à l'appareil photo. Autorisez-le dans les réglages du téléphone." : "Albert n'a pas accès à vos photos. Autorisez-le dans les réglages du téléphone.");
      return;
    }
    const posPromise = position();
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8, exif: true };
    const r = from === 'camera'
      ? await ImagePicker.launchCameraAsync(opts)
      : await ImagePicker.launchImageLibraryAsync({ ...opts, allowsMultipleSelection: true, selectionLimit: 20 });
    if (r.canceled || !r.assets?.length) {
      if (shots.length === 0) router.back();
      return;
    }
    const pos = await posPromise;
    const now = new Date();
    const next = r.assets.map((a, i): Shot => {
      const gps = exifGps(a.exif as Record<string, unknown> | null);
      // Depuis la galerie : la date EXIF fait foi ; à défaut, maintenant.
      const when = exifDate(a.exif as Record<string, unknown> | null) ?? now;
      const fromCamera = from === 'camera';
      return {
        uri: a.uri,
        filename: a.fileName ?? `photo-${now.getTime()}-${i}.jpg`,
        mimeType: a.mimeType ?? 'image/jpeg',
        takenAt: (fromCamera ? now : when).toISOString(),
        latitude: gps?.lat ?? (fromCamera ? pos?.coords.latitude ?? null : null),
        longitude: gps?.lng ?? (fromCamera ? pos?.coords.longitude ?? null : null),
        accuracy: gps ? null : fromCamera ? pos?.coords.accuracy ?? null : null,
      };
    });
    setShots((s) => [...s, ...next]);
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    add(source === 'library' ? 'library' : 'camera');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    if (!shots.length) return;
    setSaving(true);
    try {
      const batchId = uuid();
      for (const shot of shots) {
        const entryId = uuid();
        const payload: PhotoPayload = {
          fileUri: keepForUpload(shot.uri, entryId, shot.filename),
          filename: shot.filename,
          mimeType: shot.mimeType,
          batchId,
          takenAt: shot.takenAt,
          latitude: shot.latitude,
          longitude: shot.longitude,
          accuracy: shot.accuracy,
          caption: caption.trim() || null,
          visibility,
        };
        await enqueue(outbox, { id: entryId, kind: 'photo', siteId: id, payload, createdAt: shot.takenAt });
      }
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible d'enregistrer les photos sur le téléphone.");
    } finally {
      setSaving(false);
    }
  }

  const located = shots.filter((x) => x.latitude !== null).length;
  const first = shots[0];
  const lastShot = shots[shots.length - 1];

  return (
    <Screen
      back
      title={`Photos · ${site.data?.name ?? ''}`}
      action={<Button label={shots.length > 1 ? `Enregistrer ${shots.length} photos` : 'Enregistrer la photo'} onPress={save} busy={saving} disabled={!shots.length} />}
    >
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s2 }}>
        {shots.map((x, i) => (
          <View key={x.uri}>
            <Image source={{ uri: x.uri }} style={{ width: 96, height: 96, borderRadius: radius.r1, borderWidth: 1, borderColor: colors.rule2, backgroundColor: colors.bg2 }} contentFit="cover" />
            <Pressable accessibilityRole="button" accessibilityLabel="Retirer cette photo" hitSlop={10}
              onPress={() => setShots((s) => s.filter((_, k) => k !== i))}
              style={{ position: 'absolute', top: 4, right: 4, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.night, alignItems: 'center', justifyContent: 'center' }}>
              <X size={16} strokeWidth={2} color={colors.nightInk} />
            </Pressable>
          </View>
        ))}
      </View>

      {first && lastShot ? (
        <View style={{ flexDirection: 'row', gap: space.s2, alignItems: 'flex-start' }}>
          <MapPin size={18} strokeWidth={1.75} color={colors.ink3} />
          <Text style={[t.mention, { flex: 1 }]}>
            {fmt.takenRange(first.takenAt, lastShot.takenAt)}
            {located === shots.length ? ', position enregistrée.' : located > 0 ? `, position enregistrée pour ${located} sur ${shots.length}.` : locStatus === 'denied' ? ". Sans position : la localisation n'est pas autorisée." : ', sans position.'}
          </Text>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: space.s2 }}>
        <Button kind="ghost" label="Une autre" iconLeft={<Camera size={20} strokeWidth={1.75} color={colors.ink} />} onPress={() => add('camera')} style={{ flex: 1 }} />
        <Button kind="ghost" label="Galerie" iconLeft={<Images size={20} strokeWidth={1.75} color={colors.ink} />} onPress={() => add('library')} style={{ flex: 1 }} />
      </View>

      <View>
        <Text style={[t.mention, { marginBottom: space.s2 }]}>Ce que montrent ces photos</Text>
        <Field value={caption} onChangeText={setCaption} placeholder="Reprise de l’étanchéité terrasse" accessibilityLabel="Ce que montrent ces photos" />
      </View>

      <VisibilitySeg value={visibility} onChange={setVisibility} />
      {!online ? <NetBanner text="Hors ligne. Les photos sont enregistrées sur votre téléphone et partiront dès que vous captez." /> : null}
      <ErrorText text={error} />
    </Screen>
  );
}
