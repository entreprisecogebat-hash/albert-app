<?php

namespace App\Tests\Service;

use App\Pdf\PdfWriter;
use App\Service\InterventionService;
use PHPUnit\Framework\TestCase;

final class PdfWriterTest extends TestCase
{
    public function testMultiPagePdfWithJpegIsWellFormed(): void
    {
        $p = new PdfWriter();
        $p->addPage();
        $p->paragraph('Fiche d’intervention — « réception »', 18, true);
        for ($i = 0; $i < 120; ++$i) {
            $p->paragraph('Ligne '.$i.' : reprise d’étanchéité, relevés, évacuation des eaux pluviales.');
        }
        $p->jpeg(InterventionService::renderSignature([[[0.1, 0.5], [0.9, 0.5]]], 300, 120), 60, 600, 200, 80);
        $pdf = $p->output();

        self::assertStringStartsWith('%PDF-1.4', $pdf);
        self::assertStringEndsWith("%%EOF\n", $pdf);
        self::assertGreaterThan(2, $p->pageCount());
        self::assertStringContainsString('/Filter /DCTDecode', $pdf);
        // La table xref pointe sur le debut de chaque objet
        preg_match('/startxref\n(\d+)/', $pdf, $m);
        self::assertStringStartsWith('xref', substr($pdf, (int) $m[1]));
    }

    public function testWrapKeepsWordsAndSplitsLongTokens(): void
    {
        $lines = PdfWriter::wrap(str_repeat('mot ', 50), 10, 100);
        foreach ($lines as $l) {
            self::assertLessThanOrEqual(20, mb_strlen($l));
        }
        self::assertCount(1, PdfWriter::wrap('', 10, 100));
        self::assertGreaterThan(1, count(PdfWriter::wrap(str_repeat('x', 50), 10, 100)));
    }

    public function testEscapeHandlesFrenchTypography(): void
    {
        self::assertSame('l\\(a\\) '.iconv('UTF-8', 'Windows-1252', 'é’'), PdfWriter::escape('l(a) é’'));
    }
}
