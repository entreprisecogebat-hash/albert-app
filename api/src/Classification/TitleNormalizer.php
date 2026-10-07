<?php

namespace App\Classification;

/**
 * Lecture du nom de fichier : titre lisible, indice de version, forme normalisee.
 * Meme algorithme que packages/shared/src/classification.ts (utilise hors ligne sur le telephone).
 * Toute modification doit etre faite des deux cotes ; les tests partagent les memes cas.
 */
final class TitleNormalizer
{
    /** Mots qui n'identifient pas un document : on les retire pour reconnaitre une nouvelle version. */
    private const NOISE = ['final', 'finale', 'def', 'definitif', 'definitive', 'copie', 'copy', 'new', 'nouveau', 'nouvelle', 'maj', 'ok', 'bis', 'version', 'scan', 'signe', 'signee'];

    /** Mots vides : "Plan de calepinage" et "Plan_calepinage" designent le meme document. */
    private const STOP = ['de', 'du', 'des', 'd', 'la', 'le', 'les', 'l', 'et', 'a', 'au', 'aux', 'en', 'pour', 'sur', 'un', 'une', 'n', 'no'];

    public static function stripAccents(string $s): string
    {
        $t = \Normalizer::normalize($s, \Normalizer::FORM_D);
        return preg_replace('/\p{Mn}+/u', '', $t ?: $s) ?? $s;
    }

    /** "Plan_calepinage_FINAL_v3.pdf" -> "plan calepinage final v3" */
    public static function normalizeName(string $filename): string
    {
        $base = preg_replace('/\.[a-z0-9]{1,5}$/i', '', trim($filename)) ?? $filename;
        $s = mb_strtolower(self::stripAccents($base));
        $s = preg_replace('/[_\-.+()\[\]]+/u', ' ', $s) ?? $s;
        return trim(preg_replace('/\s+/u', ' ', $s) ?? $s);
    }

    /**
     * Indice de version lu dans le nom.
     * @return array{number: ?int, label: ?string}
     */
    public static function extractVersion(string $filename): array
    {
        $n = self::normalizeName($filename);
        if (preg_match('/\b(?:v|version|vers)\s?(\d{1,3})\b/u', $n, $m)) {
            return ['number' => (int) $m[1], 'label' => 'V'.(int) $m[1]];
        }
        if (preg_match('/\b(?:ind|indice)\s?([a-z])\b/u', $n, $m)) {
            $letter = strtoupper($m[1]);
            return ['number' => ord($letter) - 64, 'label' => 'Ind. '.$letter];
        }
        if (preg_match('/\brev\s?(\d{1,3})\b/u', $n, $m)) {
            return ['number' => (int) $m[1], 'label' => 'Rev. '.(int) $m[1]];
        }
        return ['number' => null, 'label' => null];
    }

    /** Forme qui ne change pas d'une version a l'autre : sert a rattacher la V3 a la V2. */
    public static function normalize(string $filenameOrTitle): string
    {
        $n = self::normalizeName($filenameOrTitle);
        $n = preg_replace('/\b(?:v|version|vers)\s?\d{1,3}\b/u', ' ', $n) ?? $n;
        $n = preg_replace('/\b(?:ind|indice)\s?[a-z]\b/u', ' ', $n) ?? $n;
        $n = preg_replace('/\brev\s?\d{1,3}\b/u', ' ', $n) ?? $n;
        // dates collees au nom : 2026 03 12, 20260312, 12 03 26
        $n = preg_replace('/\b\d{8}\b|\b\d{4}\s\d{2}\s\d{2}\b|\b\d{2}\s\d{2}\s\d{2,4}\b/u', ' ', $n) ?? $n;
        $n = str_replace(["'", '’', '°'], ' ', $n);
        $words = array_filter(
            explode(' ', $n),
            fn ($w) => $w !== '' && !in_array($w, self::NOISE, true) && !in_array($w, self::STOP, true) && !preg_match('/^\d$/', $w),
        );
        return implode(' ', $words);
    }

    /** Titre affiche : "Plan_calepinage_final_v3.pdf" -> "Plan calepinage" */
    public static function displayTitle(string $filename): string
    {
        $base = preg_replace('/\.[a-z0-9]{1,5}$/i', '', trim($filename)) ?? $filename;
        $s = preg_replace('/[_\-.+]+/u', ' ', $base) ?? $base;
        $s = preg_replace('/\b(?:v|version|vers)\s?\d{1,3}\b/iu', ' ', $s) ?? $s;
        $s = preg_replace('/\b(?:ind|indice)\.?\s?[a-z]\b/iu', ' ', $s) ?? $s;
        $s = preg_replace('/\brev\.?\s?\d{1,3}\b/iu', ' ', $s) ?? $s;
        $s = preg_replace('/\b\d{8}\b|\b\d{4}\s\d{2}\s\d{2}\b|\b\d{2}\s\d{2}\s\d{2,4}\b/u', ' ', $s) ?? $s;
        $words = array_filter(preg_split('/\s+/u', $s) ?: [], function ($w) {
            $plain = mb_strtolower(self::stripAccents($w));
            return $w !== '' && !in_array($plain, self::NOISE, true) && !preg_match('/^\(?\d\)?$/', $w);
        });
        $title = trim(implode(' ', $words));
        if ($title === '') {
            return 'Document';
        }
        // Les noms en capitales (DEVIS_TOITEC) deviennent lisibles
        if (mb_strtoupper($title) === $title) {
            $title = mb_strtolower($title);
        }
        return mb_strtoupper(mb_substr($title, 0, 1)).mb_substr($title, 1);
    }
}
