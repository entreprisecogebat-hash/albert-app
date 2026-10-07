<?php

namespace App\Service;

/** Numeros francais et europeens au format E.164. "06 12 34 56 78" -> "+33612345678" */
final class PhoneNumber
{
    public static function normalize(string $raw): ?string
    {
        $s = preg_replace('/[^\d+]/', '', $raw) ?? '';
        if (str_starts_with($s, '00')) {
            $s = '+'.substr($s, 2);
        }
        if (preg_match('/^0[1-9]\d{8}$/', $s)) {
            $s = '+33'.substr($s, 1);
        }
        if (preg_match('/^\+33(0)(\d{9})$/', $s, $m)) {
            $s = '+33'.$m[2];
        }
        return preg_match('/^\+[1-9]\d{7,14}$/', $s) ? $s : null;
    }

    /** "+33612345678" -> "+33 6 12 34 56 78" */
    public static function format(string $e164): string
    {
        if (preg_match('/^\+33(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/', $e164, $m)) {
            return sprintf('+33 %s %s %s %s %s', $m[1], $m[2], $m[3], $m[4], $m[5]);
        }
        return $e164;
    }
}
