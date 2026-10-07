import { colors, lift, radius, space, target } from '@albert/shared';
import { Platform, type TextStyle } from 'react-native';

export { colors, radius, space, target };

/** Familles chargées par expo-font (une famille par graisse sur mobile). */
export const font = {
  display600: 'Archivo_600SemiBold',
  display700: 'Archivo_700Bold',
  sans400: 'IBMPlexSans_400Regular',
  sans500: 'IBMPlexSans_500Medium',
  sans600: 'IBMPlexSans_600SemiBold',
  mono400: 'IBMPlexMono_400Regular',
  mono500: 'IBMPlexMono_500Medium',
} as const;

/** Échelle typographique de la charte. 17 px minimum pour le corps. */
export const t = {
  screenTitle: { fontFamily: font.display700, fontSize: 28, lineHeight: 32, letterSpacing: -0.56, color: colors.ink },
  appbar: { fontFamily: font.display700, fontSize: 24, lineHeight: 28, letterSpacing: -0.48, color: colors.ink },
  section: { fontFamily: font.display600, fontSize: 22, lineHeight: 26, letterSpacing: -0.44, color: colors.ink },
  statement: { fontFamily: font.display600, fontSize: 20, lineHeight: 26, letterSpacing: -0.4, color: colors.ink },
  cardTitle: { fontFamily: font.display600, fontSize: 19, lineHeight: 23, letterSpacing: -0.28, color: colors.ink },
  body: { fontFamily: font.sans400, fontSize: 17, lineHeight: 26, color: colors.ink },
  bodyStrong: { fontFamily: font.sans600, fontSize: 17, lineHeight: 22, color: colors.ink },
  secondary: { fontFamily: font.sans400, fontSize: 15, lineHeight: 22, color: colors.ink2 },
  mention: { fontFamily: font.sans400, fontSize: 14, lineHeight: 20, color: colors.ink3 },
  small: { fontFamily: font.sans400, fontSize: 13, lineHeight: 18, color: colors.ink3 },
  tag: { fontFamily: font.sans600, fontSize: 13, lineHeight: 17 },
  value: { fontFamily: font.mono400, fontSize: 13, lineHeight: 18, color: colors.ink3 },
  meta: { fontFamily: font.mono400, fontSize: 12, lineHeight: 16, color: colors.ink3 },
  button: { fontFamily: font.sans600, fontSize: 17, letterSpacing: -0.17 },
} satisfies Record<string, TextStyle>;

/** Seule élévation autorisée : couche flottante (barre d'action, feuille). */
export const floating = Platform.select({
  web: { boxShadow: lift.css } as object,
  default: lift.native,
});
