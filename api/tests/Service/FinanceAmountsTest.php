<?php

namespace App\Tests\Service;

use App\Entity\Company;
use App\Entity\FinanceEntry;
use App\Entity\Site;
use App\Service\FinanceService;
use PHPUnit\Framework\TestCase;

/** Calculs : TVA en points de base, arrondi commercial au centime, statuts de paiement. */
final class FinanceAmountsTest extends TestCase
{
    public function testVatCommercialRounding(): void
    {
        self::assertSame(2000, FinanceEntry::vat(10000, 2000));       // 100 € a 20 % = 20 €
        self::assertSame(55, FinanceEntry::vat(1000, 550));           // 10 € a 5,5 % = 0,55 €
        self::assertSame(0, FinanceEntry::vat(9, 550));               // 0,495 centime -> 0
        self::assertSame(3, FinanceEntry::vat(25, 1000));             // 2,5 centimes -> 3 (demi a l'ecart de zero)
        self::assertSame(2, FinanceEntry::vat(24, 1000));             // 2,4 centimes -> 2
        self::assertSame(-3, FinanceEntry::vat(-25, 1000));           // avoir : symetrique
        self::assertSame(0, FinanceEntry::vat(123456, 0));            // autoliquidation
        self::assertSame(1860000, FinanceEntry::vat(18600000, 1000)); // 186 000 € a 10 %
    }

    public function testTotalsAndPaymentStatus(): void
    {
        $f = new FinanceEntry($this->site(), FinanceEntry::KIND_INVOICE, 'Situation n°1', null);
        $f->setAmounts(1234567, 2000);
        self::assertSame(246913, $f->getAmountVat());
        self::assertSame(1481480, $f->getAmountTtc());
        self::assertSame('draft', $f->getStatus());

        // Un brouillon reste brouillon
        $f->applyPaid(0);
        self::assertSame('draft', $f->getStatus());

        $f->setStatus(FinanceEntry::STATUS_SENT);
        $f->applyPaid(100000);
        self::assertSame('partially_paid', $f->getStatus());
        self::assertSame(1381480, $f->getRemaining());
        $f->applyPaid(1481480);
        self::assertSame('paid', $f->getStatus());
        $f->applyPaid(0);
        self::assertSame('sent', $f->getStatus(), 'retirer les paiements ramene a « envoyee »');
    }

    public function testExpenseStatusAndOverdue(): void
    {
        $e = new FinanceEntry($this->site(), FinanceEntry::KIND_EXPENSE, 'Location', null);
        $e->setAmounts(10000, 2000);
        self::assertSame('to_pay', $e->getStatus());
        $e->setDueOn(new \DateTimeImmutable('-1 day'));
        self::assertTrue($e->isOverdue());
        $e->applyPaid(12000);
        self::assertSame('paid', $e->getStatus());
        self::assertFalse($e->isOverdue());
    }

    public function testCsvAmountsAndEuros(): void
    {
        self::assertSame('12480,50', FinanceService::csvAmount(1248050));
        self::assertSame('0,05', FinanceService::csvAmount(5));
        self::assertSame('-3,00', FinanceService::csvAmount(-300));
        self::assertSame("186\u{202F}000\u{00A0}€", FinanceService::euros(18600000));
        self::assertSame("12\u{202F}480,50\u{00A0}€", FinanceService::euros(1248050));
    }

    private function site(): Site
    {
        return new Site(new Company('Test', 'test'), 'Chantier', 'Adresse');
    }
}
