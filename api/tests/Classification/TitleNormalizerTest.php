<?php

namespace App\Tests\Classification;

use App\Classification\TitleNormalizer;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/** Memes cas que packages/shared (classement hors ligne sur le telephone). */
final class TitleNormalizerTest extends TestCase
{
    public static function cases(): iterable
    {
        $data = json_decode((string) file_get_contents(__DIR__.'/../../../packages/shared/classification-cases.json'), true);
        foreach ($data['cases'] as $c) {
            yield $c['file'] => [$c['file'], $c['display'], $c['normalized'], $c['version']];
        }
    }

    #[DataProvider('cases')]
    public function testSharedCases(string $file, string $display, string $normalized, array $version): void
    {
        self::assertSame($display, TitleNormalizer::displayTitle($file));
        self::assertSame($normalized, TitleNormalizer::normalize($file));
        $v = TitleNormalizer::extractVersion($file);
        self::assertSame($version, [$v['number'], $v['label']]);
    }

    public function testNewVersionMatchesTitleWithArticles(): void
    {
        self::assertSame(TitleNormalizer::normalize('Plan de calepinage'), TitleNormalizer::normalize('Plan_calepinage_final_v3.pdf'));
    }
}
