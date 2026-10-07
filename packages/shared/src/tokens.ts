/**
 * Charte Albert V0.2 (Sooyoos, 22 septembre 2026), traduite en tokens.
 * Une seule source pour l'application mobile et le back-office.
 *
 * Règles qui ne se négocient pas :
 *  - un seul jaune par écran : l'action principale ;
 *  - 17 px minimum pour le corps, 56 px pour une cible tactile principale ;
 *  - les statuts (client, envoyé, blocage) sont des filets ou des pastilles, toujours doublés d'un mot ;
 *  - le hors ligne n'est pas coloré : gris d'encre et phrase calme.
 */

export const colors = {
  // Surfaces
  bg: '#FAFAFA',
  bg2: '#F1F1F1',
  paper: '#FFFFFF',
  // Encre
  ink: '#333840',
  ink2: '#434A54',
  ink3: '#535A64',
  // Filets
  rule: 'rgba(51,56,64,0.10)', // #3338401A
  rule2: 'rgba(51,56,64,0.20)', // #33384033
  // Inverse
  night: '#2C3138',
  night2: '#363C44',
  nightInk: '#FFFFFF',
  night3: '#9AA0A8',
  ruleNight: 'rgba(255,255,255,0.18)',
  // Accent unique : le jaune casque. Le token s'appelle accent, pas jaune.
  accent: '#FFCB11',
  // Statuts
  client: '#00C7D3',
  sync: '#34C855',
  alerte: '#C8442E',
  bezel: '#15181C',
} as const;

export const fonts = {
  display: 'Archivo',
  sans: 'IBM Plex Sans',
  mono: 'IBM Plex Mono',
} as const;

/** Échelle de 4 px héritée de Sooyoos */
export const space = { s1: 4, s2: 8, s3: 12, s4: 16, s5: 24, s6: 32, s7: 48, s8: 64, s9: 96 } as const;

/** 8 champs · 12 cartes · 16 feuilles · 999 boutons */
export const radius = { r1: 8, r2: 12, r3: 16, pill: 999 } as const;

/** Cibles tactiles : 56 action principale, 48 secondaire, 44 plancher absolu. */
export const target = { primary: 56, secondary: 48, min: 44, gap: 12 } as const;

/** Échelle typographique de l'application */
export const type = {
  screenTitle: { family: fonts.display, weight: '700', size: 28, lineHeight: 1.15, letterSpacing: -0.02 },
  appbarTitle: { family: fonts.display, weight: '700', size: 24, lineHeight: 1.15, letterSpacing: -0.02 },
  sectionTitle: { family: fonts.display, weight: '600', size: 22, lineHeight: 1.2, letterSpacing: -0.02 },
  statement: { family: fonts.display, weight: '600', size: 20, lineHeight: 1.3, letterSpacing: -0.02 },
  cardTitle: { family: fonts.display, weight: '600', size: 19, lineHeight: 1.2, letterSpacing: -0.015 },
  body: { family: fonts.sans, weight: '400', size: 17, lineHeight: 1.55, letterSpacing: 0 },
  bodyStrong: { family: fonts.sans, weight: '600', size: 17, lineHeight: 1.3, letterSpacing: 0 },
  secondary: { family: fonts.sans, weight: '400', size: 15, lineHeight: 1.45, letterSpacing: 0 },
  mention: { family: fonts.sans, weight: '400', size: 14, lineHeight: 1.4, letterSpacing: 0 },
  tag: { family: fonts.sans, weight: '600', size: 13, lineHeight: 1.3, letterSpacing: 0 },
  value: { family: fonts.mono, weight: '400', size: 13, lineHeight: 1.4, letterSpacing: 0 },
  button: { family: fonts.sans, weight: '600', size: 17, lineHeight: 1.2, letterSpacing: -0.01 },
} as const;

/** Mouvement : il signale un état, il ne décore rien. */
export const motion = {
  press: 120,
  pressScale: 0.985,
  state: 200,
  sheet: 280,
  easing: [0.2, 0.7, 0.3, 1] as const,
  easingCss: 'cubic-bezier(.2,.7,.3,1)',
} as const;

/** Élévation : uniquement les couches flottantes (barre d'action fixe, feuille). */
export const lift = {
  css: '0 2px 12px rgba(51,56,64,.10)',
  native: { shadowColor: '#333840', shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: 2 }, elevation: 6 },
} as const;

/** Variables CSS pour le back-office, mêmes noms que la charte HTML. */
export function cssVariables(): string {
  return `:root{
  --bg:${colors.bg}; --bg-2:${colors.bg2}; --paper:${colors.paper};
  --ink:${colors.ink}; --ink-2:${colors.ink2}; --ink-3:${colors.ink3};
  --rule:#3338401A; --rule-2:#33384033;
  --night:${colors.night}; --night-2:${colors.night2}; --night-ink:${colors.nightInk}; --night-3:${colors.night3};
  --rule-night:${colors.ruleNight};
  --accent:${colors.accent};
  --client:${colors.client}; --sync:${colors.sync}; --alerte:${colors.alerte};
  --display:"Archivo",system-ui,sans-serif;
  --sans:"IBM Plex Sans",system-ui,-apple-system,sans-serif;
  --mono:"IBM Plex Mono",ui-monospace,monospace;
  --s1:4px; --s2:8px; --s3:12px; --s4:16px; --s5:24px; --s6:32px; --s7:48px; --s8:64px; --s9:96px;
  --r1:8px; --r2:12px; --r3:16px; --pill:999px;
  --lift:${lift.css};
  --ease:${motion.easingCss};
}`;
}
