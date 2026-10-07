import { fmt } from '@albert/shared';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { X } from 'lucide-react-native';
import { useState } from 'react';
import { Dimensions, FlatList, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../lib/api';
import { colors, font, space } from '../ui/theme';

/** Visionneuse d'un lot de photos : chaque image avec son heure, son auteur et sa position. */
export default function PhotoViewer() {
  const { siteId, batchId } = useLocalSearchParams<{ siteId: string; batchId: string }>();
  const insets = useSafeAreaInsets();
  const { width } = Dimensions.get('window');
  const photos = useQuery({ queryKey: ['photos', siteId, batchId], queryFn: () => api.sites.photos(siteId, batchId) });
  const items = [...(photos.data?.items ?? [])].sort((a, b) => a.takenAt.localeCompare(b.takenAt));
  const [index, setIndex] = useState(0);
  const cur = items[index];

  return (
    <View style={{ flex: 1, backgroundColor: colors.night, paddingTop: insets.top }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.s4, minHeight: 56 }}>
        <Text style={{ flex: 1, fontFamily: font.mono400, fontSize: 14, color: colors.night3 }}>
          {items.length ? `${index + 1} / ${items.length}` : ''}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Fermer" onPress={() => router.back()} hitSlop={10} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
          <X size={26} strokeWidth={1.75} color={colors.nightInk} />
        </Pressable>
      </View>
      <FlatList
        data={items}
        keyExtractor={(p) => p.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item }) => (
          <View style={{ width, flex: 1, justifyContent: 'center' }}>
            <Image source={{ uri: item.url }} placeholder={{ uri: item.thumbUrl }} style={{ width, height: '100%' }} contentFit="contain" accessibilityLabel={item.caption ?? 'Photo du chantier'} />
          </View>
        )}
      />
      {cur ? (
        <View style={{ padding: space.s4, paddingBottom: insets.bottom + space.s4, gap: space.s1 }}>
          {cur.caption ? <Text style={{ fontFamily: font.sans600, fontSize: 17, color: colors.nightInk }}>{cur.caption}</Text> : null}
          <Text style={{ fontFamily: font.mono400, fontSize: 13, color: colors.night3 }}>
            Prise {fmt.exact(cur.takenAt)}{cur.uploadedBy ? ` · ${cur.uploadedBy.fullName}` : ''}
          </Text>
          <Text style={{ fontFamily: font.mono400, fontSize: 13, color: colors.night3 }}>
            {cur.latitude !== null && cur.longitude !== null
              ? `Position ${cur.latitude.toFixed(5)}, ${cur.longitude.toFixed(5)}${cur.accuracy ? ` (± ${Math.round(cur.accuracy)} m)` : ''}`
              : 'Sans position'}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
