<?php

namespace App\Tests\Service;

use App\Service\PhoneNumber;
use PHPUnit\Framework\TestCase;

final class PhoneNumberTest extends TestCase
{
    public function testNormalize(): void
    {
        self::assertSame('+33612345678', PhoneNumber::normalize('06 12 34 56 78'));
        self::assertSame('+33612345678', PhoneNumber::normalize('+33 6 12 34 56 78'));
        self::assertSame('+33612345678', PhoneNumber::normalize('0033612345678'));
        self::assertSame('+33612345678', PhoneNumber::normalize('+33 (0)6 12 34 56 78'));
        self::assertSame('+34612345678', PhoneNumber::normalize('+34 612 345 678'));
        self::assertNull(PhoneNumber::normalize('12'));
    }

    public function testFormat(): void
    {
        self::assertSame('+33 6 12 34 56 78', PhoneNumber::format('+33612345678'));
    }
}
