import { useRef, useState } from 'react';
import { Platform, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { TextButton } from './components';
import { colors, radius, space, t } from './theme';

export type Strokes = [number, number][][];

/**
 * Pavé de signature au doigt (F-12). Les traits sont gardés en coordonnées
 * normalisées (0..1) : le serveur les redessine à n'importe quelle taille.
 * Fonctionne au toucher, au stylet et à la souris (banc d'essai web).
 * `onDrawing` prévient l'écran qu'un trait est en cours, pour qu'il bloque son défilement.
 */
export function SignaturePad({ onChange, onDrawing, height = 200 }: {
  onChange: (strokes: Strokes, size: { width: number; height: number }) => void;
  onDrawing?: (drawing: boolean) => void;
  height?: number;
}) {
  const [size, setSize] = useState({ width: 0, height });
  const [strokes, setStrokes] = useState<Strokes>([]);
  // Copie à jour pour les gestionnaires de toucher, qui s'enchaînent plus vite que les rendus.
  const live = useRef<Strokes>([]);

  const update = (next: Strokes) => {
    live.current = next;
    setStrokes(next);
  };

  // Les enfants ne captent pas le toucher : locationX/Y restent relatifs au pavé, même sur Android.
  const point = (e: GestureResponderEvent): [number, number] => {
    const { locationX, locationY } = e.nativeEvent;
    const w = size.width || 1;
    return [clamp(locationX / w), clamp(locationY / size.height)];
  };

  // Fin du trait, que le doigt se lève ou que le système reprenne le geste.
  const end = () => {
    onDrawing?.(false);
    onChange(live.current, size);
  };

  return (
    <View>
      <View
        onLayout={(e: LayoutChangeEvent) => {
          // Ne change l'état que si la largeur change vraiment : sinon chaque mesure relance un rendu, en boucle.
          const width = Math.round(e.nativeEvent.layout.width);
          setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
        }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onStartShouldSetResponderCapture={() => true}
        onMoveShouldSetResponderCapture={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(e) => {
          onDrawing?.(true);
          update([...live.current, [point(e)]]);
        }}
        onResponderMove={(e) => {
          const cur = live.current;
          const last = cur[cur.length - 1];
          if (!last) return;
          update([...cur.slice(0, -1), [...last, point(e)]]);
        }}
        onResponderRelease={end}
        onResponderTerminate={end}
        accessibilityLabel="Zone de signature"
        style={[
          { height, borderRadius: radius.r2, borderWidth: 1, borderColor: colors.rule2, backgroundColor: colors.paper, overflow: 'hidden' },
          Platform.OS === 'web' ? ({ touchAction: 'none', cursor: 'crosshair', userSelect: 'none' } as object) : null,
        ]}
      >
        {size.width > 0 ? (
          <View style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}>
            <Svg width={size.width} height={height}>
              {strokes.map((st, i) => (
                <Path key={i} d={toPath(st, size.width, height)} stroke={colors.ink} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              ))}
            </Svg>
          </View>
        ) : null}
        {strokes.length === 0 ? (
          <View style={{ position: 'absolute', left: space.s4, right: space.s4, bottom: space.s5, borderTopWidth: 1, borderTopColor: colors.rule2, paddingTop: space.s1, pointerEvents: 'none' }}>
            <Text style={t.small}>Signez ici avec le doigt</Text>
          </View>
        ) : null}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <TextButton label="Effacer la signature" onPress={() => {
          update([]);
          onChange([], size);
        }} />
      </View>
    </View>
  );
}

function clamp(v: number): number {
  return Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000;
}

function toPath(stroke: [number, number][], w: number, h: number): string {
  if (stroke.length === 1) {
    const [x, y] = stroke[0]!;
    return `M${x * w} ${y * h} l0.1 0.1`;
  }
  return stroke.map(([x, y], i) => `${i ? 'L' : 'M'}${(x * w).toFixed(1)} ${(y * h).toFixed(1)}`).join(' ');
}
