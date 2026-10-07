import {
  RecordingPresets,
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type RecordingOptions,
} from 'expo-audio';
import { useRef } from 'react';

/** Voix seule : mono, 64 kb/s en AAC (.m4a), assez pour la transcription et léger à envoyer. */
const VOICE: RecordingOptions = { ...RecordingPresets.HIGH_QUALITY, numberOfChannels: 1, bitRate: 64_000 };

/** En dessous, c'est un appui long sans parole : on ne l'envoie pas. */
const MIN_MS = 700;

export type Recording = { uri: string; durationMs: number; mimeType: string; filename: string };

/**
 * Enregistrer tant que le doigt reste posé (appui long sur le bouton +).
 * start() à l'appui long, stop() au relâchement ; stop() rend null si rien d'exploitable.
 */
export function useHoldToRecord() {
  const recorder = useAudioRecorder(VOICE);
  // Le relâchement peut arriver avant la fin de la préparation : stop() attend start().
  const starting = useRef<Promise<boolean> | null>(null);
  const startedAt = useRef(0);

  async function begin(): Promise<boolean> {
    const perm = await getRecordingPermissionsAsync();
    if (!perm.granted) {
      // La demande d'autorisation interrompt le geste : on enregistrera au prochain appui.
      await requestRecordingPermissionsAsync();
      return false;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    startedAt.current = Date.now();
    return true;
  }

  function start(): Promise<boolean> {
    starting.current = begin().catch(() => false);
    return starting.current;
  }

  async function stop(): Promise<Recording | null> {
    const ok = await (starting.current ?? Promise.resolve(false));
    starting.current = null;
    if (!ok) return null;
    const durationMs = Date.now() - startedAt.current;
    try {
      await recorder.stop();
    } finally {
      // Sans cela, iOS continue de jouer le son dans l'écouteur.
      setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    }
    const uri = recorder.uri;
    if (!uri || durationMs < MIN_MS) return null;
    const web = uri.startsWith('blob:');
    return { uri, durationMs, mimeType: web ? 'audio/webm' : 'audio/mp4', filename: web ? 'commande.webm' : 'commande.m4a' };
  }

  return { start, stop };
}
