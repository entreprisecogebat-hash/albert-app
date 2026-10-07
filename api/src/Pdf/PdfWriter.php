<?php

namespace App\Pdf;

/**
 * Generateur PDF minimal, sans dependance : pages A4, texte Helvetica (WinAnsi), traits, cadres
 * et images JPEG (/DCTDecode). Suffisant pour les fiches d'intervention et le DOE.
 * Coordonnees en points, origine en haut a gauche (convertie a l'ecriture).
 */
final class PdfWriter
{
    public const W = 595.0;
    public const H = 842.0;
    public const MARGIN = 56.0;

    /** @var list<string> flux de contenu par page */
    private array $pages = [];
    /** @var list<array{data: string, w: int, h: int}> */
    private array $images = [];
    private int $current = -1;
    /** Position verticale courante (depuis le haut) pour l'ecriture en flux */
    public float $y = self::MARGIN;

    public function addPage(): void
    {
        $this->pages[] = '';
        $this->current = count($this->pages) - 1;
        $this->y = self::MARGIN;
    }

    public function pageCount(): int
    {
        return count($this->pages);
    }

    public function text(float $x, float $y, string $text, float $size = 11, bool $bold = false, array $rgb = [0.2, 0.22, 0.25]): void
    {
        $font = $bold ? 'F2' : 'F1';
        $this->raw(sprintf(
            "BT %s rg /%s %.1F Tf %.2F %.2F Td (%s) Tj ET\n",
            $this->rgb($rgb), $font, $size, $x, self::H - $y, self::escape($text),
        ));
    }

    public function line(float $x1, float $y1, float $x2, float $y2, float $width = 0.6, array $rgb = [0.75, 0.75, 0.75]): void
    {
        $this->raw(sprintf("%s RG %.2F w %.2F %.2F m %.2F %.2F l S\n", $this->rgb($rgb), $width, $x1, self::H - $y1, $x2, self::H - $y2));
    }

    public function rect(float $x, float $y, float $w, float $h, ?array $fill = null, ?array $stroke = [0.75, 0.75, 0.75]): void
    {
        $op = $fill && $stroke ? 'B' : ($fill ? 'f' : 'S');
        $this->raw(sprintf(
            "%s%s%.2F %.2F %.2F %.2F re %s\n",
            $fill ? $this->rgb($fill).' rg ' : '', $stroke ? $this->rgb($stroke).' RG 0.6 w ' : '',
            $x, self::H - $y - $h, $w, $h, $op,
        ));
    }

    /** Image JPEG placee dans un cadre (x, y depuis le haut), proportions conservees. */
    public function jpeg(string $data, float $x, float $y, float $maxW, float $maxH): void
    {
        $info = @getimagesizefromstring($data);
        if (!$info || $info[2] !== IMAGETYPE_JPEG) {
            return;
        }
        [$iw, $ih] = $info;
        $scale = min($maxW / $iw, $maxH / $ih);
        $w = $iw * $scale;
        $h = $ih * $scale;
        $this->images[] = ['data' => $data, 'w' => $iw, 'h' => $ih];
        $name = 'Im'.count($this->images);
        $this->raw(sprintf("q %.2F 0 0 %.2F %.2F %.2F cm /%s Do Q\n", $w, $h, $x, self::H - $y - $h, $name));
    }

    /**
     * Paragraphe en flux avec retour a la ligne automatique et saut de page.
     * Approximation de largeur Helvetica : 0,5 x la taille par caractere.
     */
    public function paragraph(string $text, float $size = 11, bool $bold = false, float $x = self::MARGIN, ?float $width = null, float $leading = 1.4, array $rgb = [0.2, 0.22, 0.25]): void
    {
        $width ??= self::W - self::MARGIN - $x;
        foreach (preg_split('/\R/u', $text) ?: [] as $para) {
            foreach (self::wrap($para, $size, $width) as $line) {
                $this->ensure($size * $leading);
                $this->y += $size;
                $this->text($x, $this->y, $line, $size, $bold, $rgb);
                $this->y += $size * ($leading - 1);
            }
        }
    }

    /** Saut de page si la place manque. */
    public function ensure(float $height): void
    {
        if ($this->current < 0 || $this->y + $height > self::H - self::MARGIN) {
            $this->addPage();
        }
    }

    /** @return list<string> */
    public static function wrap(string $text, float $size, float $width): array
    {
        $max = max(10, (int) floor($width / ($size * 0.5)));
        $text = trim($text);
        if ($text === '') {
            return [''];
        }
        $out = [];
        $line = '';
        foreach (preg_split('/\s+/u', $text) ?: [] as $word) {
            $candidate = $line === '' ? $word : $line.' '.$word;
            if (mb_strlen($candidate) > $max && $line !== '') {
                $out[] = $line;
                $line = $word;
            } else {
                $line = $candidate;
            }
            while (mb_strlen($line) > $max) {
                $out[] = mb_substr($line, 0, $max);
                $line = mb_substr($line, $max);
            }
        }
        if ($line !== '') {
            $out[] = $line;
        }
        return $out;
    }

    public function output(): string
    {
        if (!$this->pages) {
            $this->addPage();
        }
        $objs = [];
        $objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
        $objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
        $objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
        $next = 5;
        $xobjects = [];
        foreach ($this->images as $i => $img) {
            $objs[$next] = sprintf(
                "<< /Type /XObject /Subtype /Image /Width %d /Height %d /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length %d >>\nstream\n%s\nendstream",
                $img['w'], $img['h'], strlen($img['data']), $img['data'],
            );
            $xobjects[] = sprintf('/Im%d %d 0 R', $i + 1, $next);
            ++$next;
        }
        $resources = sprintf('<< /Font << /F1 3 0 R /F2 4 0 R >>%s >>', $xobjects ? ' /XObject << '.implode(' ', $xobjects).' >>' : '');
        $kids = [];
        $total = count($this->pages);
        foreach ($this->pages as $n => $content) {
            // Pied de page : pagination
            $content .= sprintf("BT 0.55 0.57 0.6 rg /F1 8 Tf %.2F %.2F Td (%s) Tj ET\n", self::W - self::MARGIN - 40, 28.0, self::escape(sprintf('%d / %d', $n + 1, $total)));
            $contentId = $next++;
            $pageId = $next++;
            $objs[$contentId] = "<< /Length ".strlen($content)." >>\nstream\n".$content."endstream";
            $objs[$pageId] = sprintf('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %d %d] /Contents %d 0 R /Resources %s >>', self::W, self::H, $contentId, $resources);
            $kids[] = $pageId.' 0 R';
        }
        $objs[2] = sprintf('<< /Type /Pages /Kids [%s] /Count %d >>', implode(' ', $kids), count($kids));
        ksort($objs);

        $out = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
        $offsets = [];
        foreach ($objs as $id => $body) {
            $offsets[$id] = strlen($out);
            $out .= $id." 0 obj\n".$body."\nendobj\n";
        }
        $xref = strlen($out);
        $size = max(array_keys($objs)) + 1;
        $out .= "xref\n0 ".$size."\n0000000000 65535 f \n";
        for ($i = 1; $i < $size; ++$i) {
            $out .= isset($offsets[$i]) ? sprintf("%010d 00000 n \n", $offsets[$i]) : "0000000000 65535 f \n";
        }
        return $out."trailer\n<< /Size ".$size." /Root 1 0 R >>\nstartxref\n".$xref."\n%%EOF\n";
    }

    private function raw(string $s): void
    {
        if ($this->current < 0) {
            $this->addPage();
        }
        $this->pages[$this->current] .= $s;
    }

    private function rgb(array $c): string
    {
        return sprintf('%.3F %.3F %.3F', $c[0], $c[1], $c[2]);
    }

    public static function escape(string $s): string
    {
        // Typographie francaise : apostrophes et tirets courbes existent en WinAnsi
        $s = str_replace(["\u{202F}", "\u{00A0}"], ' ', $s);
        $enc = @iconv('UTF-8', 'Windows-1252//TRANSLIT', $s);
        if ($enc === false) {
            $enc = preg_replace('/[^\x20-\x7e]/', '?', $s) ?? '';
        }
        return str_replace(['\\', '(', ')', "\r", "\n"], ['\\\\', '\\(', '\\)', '', ' '], $enc);
    }
}
