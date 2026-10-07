<?php

namespace App\Tests\Api;

/** Finances : droits, numerotation continue des factures, paiements, facturation d'un devis, export. */
final class FinanceTest extends ApiTestCase
{
    private const SOPHIE = '0622334455';
    private const MEHDI = '0633445566';
    private const LEFEVRE = '0698765432';
    private const JULIEN = '0655443322';

    public function testWorkerHasNoAccessAndClientReadsOnlyIssuedQuotesAndInvoices(): void
    {
        $sophie = $this->login(self::SOPHIE);
        $mehdi = $this->login(self::MEHDI);
        $client = $this->login(self::LEFEVRE);
        $villa = $this->siteId($sophie, 'Villa Marceau');

        // Compagnon : rien
        $this->json('GET', '/api/finances', $mehdi);
        self::assertSame(403, $this->httpStatus());
        $this->json('GET', "/api/finances?siteId=$villa", $mehdi);
        self::assertSame(403, $this->httpStatus());
        $site = $this->json('GET', "/api/sites/$villa", $mehdi);
        self::assertFalse($site['canSeeFinances']);
        self::assertNull($site['counts']['financesOpen']);
        $any = $this->json('GET', "/api/finances?siteId=$villa", $sophie)['items'][0];
        $this->json('GET', '/api/finances/'.$any['id'], $mehdi);
        self::assertSame(403, $this->httpStatus());
        $types = array_column($this->json('GET', "/api/sites/$villa/feed?limit=100", $mehdi)['items'], 'type');
        self::assertEmpty(array_intersect($types, ['quote_accepted', 'invoice_sent', 'payment_received']), 'le fil du compagnon ne montre pas les finances');

        // Une depense et un brouillon, invisibles du client
        $draft = $this->json('POST', "/api/sites/$villa/finances", $sophie, ['kind' => 'facture', 'title' => 'Brouillon interne', 'amountHt' => 10000, 'vatRate' => 1000, 'notes' => 'note interne']);
        self::assertSame(201, $this->httpStatus());

        $items = $this->json('GET', "/api/finances?siteId=$villa", $client)['items'];
        self::assertSame(200, $this->httpStatus());
        self::assertNotEmpty($items);
        foreach ($items as $f) {
            self::assertNotSame('depense', $f['kind']);
            self::assertNotSame('draft', $f['status']);
            self::assertNull($f['notes']);
            self::assertSame(0, $f['remindersCount']);
        }
        self::assertNotContains($draft['id'], array_column($items, 'id'));
        $this->json('GET', '/api/finances/'.$draft['id'], $client);
        self::assertSame(404, $this->httpStatus());

        // Lecture seule
        $this->json('PATCH', '/api/finances/'.$items[0]['id'], $client, ['notes' => 'x']);
        self::assertSame(403, $this->httpStatus());
        $this->json('POST', "/api/sites/$villa/finances", $client, ['kind' => 'devis', 'title' => 'x', 'amountHt' => 1, 'vatRate' => 2000]);
        self::assertSame(403, $this->httpStatus());
    }

    public function testInvoiceNumbersAreContinuousAndAssignedOnIssue(): void
    {
        $sophie = $this->login(self::SOPHIE);
        $villa = $this->siteId($sophie, 'Villa Marceau');
        $year = date('Y');
        $last = $this->lastInvoiceNumber($this->login('0612345678'), $year); // l'administrateur voit tous les chantiers

        $a = $this->json('POST', "/api/sites/$villa/finances", $sophie, ['kind' => 'facture', 'title' => 'Travaux supplémentaires A', 'amountHt' => 50000, 'vatRate' => 1000]);
        $b = $this->json('POST', "/api/sites/$villa/finances", $sophie, ['kind' => 'facture', 'title' => 'Travaux supplémentaires B', 'amountHt' => 70000, 'vatRate' => 1000]);
        self::assertNull($a['number'], 'pas de numéro pour un brouillon');

        // Un brouillon efface ne consomme pas de numero
        $c = $this->json('POST', "/api/sites/$villa/finances", $sophie, ['kind' => 'facture', 'title' => 'À effacer', 'amountHt' => 100, 'vatRate' => 2000]);
        $this->json('DELETE', '/api/finances/'.$c['id'], $sophie);
        self::assertSame(200, $this->httpStatus());

        $b = $this->json('PATCH', '/api/finances/'.$b['id'], $sophie, ['status' => 'sent']);
        $a = $this->json('PATCH', '/api/finances/'.$a['id'], $sophie, ['status' => 'sent']);
        self::assertSame(sprintf('F-%s-%04d', $year, $last + 1), $b['number']);
        self::assertSame(sprintf('F-%s-%04d', $year, $last + 2), $a['number']);
        self::assertSame(date('Y-m-d'), $a['issuedOn']);
        self::assertSame((new \DateTimeImmutable('+30 days'))->format('Y-m-d'), $a['dueOn'], 'échéance à 30 jours par défaut');

        // Une facture emise ne s'efface pas, ne repasse pas en brouillon, et ses montants sont figes
        $this->json('DELETE', '/api/finances/'.$a['id'], $sophie);
        self::assertSame(409, $this->httpStatus());
        $this->json('PATCH', '/api/finances/'.$a['id'], $sophie, ['status' => 'draft']);
        self::assertSame(409, $this->httpStatus());
        $this->json('PATCH', '/api/finances/'.$a['id'], $sophie, ['amountHt' => 60000]);
        self::assertSame(409, $this->httpStatus());
        $this->json('PATCH', '/api/finances/'.$a['id'], $sophie, ['number' => 'F-9999']);
        self::assertSame(409, $this->httpStatus());
        // ... mais l'echeance et les notes restent modifiables
        $d = $this->json('PATCH', '/api/finances/'.$a['id'], $sophie, ['dueOn' => '2030-01-31', 'notes' => 'Accord du client', 'amountHt' => 50000]);
        self::assertSame(200, $this->httpStatus());
        self::assertSame('2030-01-31', $d['dueOn']);
        self::assertSame(50000, $d['amountHt']);

        // Quote : un devis recoit son numero D- des sa creation
        $q = $this->json('POST', "/api/sites/$villa/finances", $sophie, ['kind' => 'devis', 'title' => 'Devis test', 'amountHt' => 100000, 'vatRate' => 1000]);
        self::assertMatchesRegularExpression('/^D-\d{4}-\d{4}$/', $q['number']);
    }

    public function testPaymentsUpdateStatusAndRefuseOverpayment(): void
    {
        $sophie = $this->login(self::SOPHIE);
        $villa = $this->siteId($sophie, 'Villa Marceau');
        $f = $this->json('POST', "/api/sites/$villa/finances", $sophie, ['kind' => 'facture', 'title' => 'Facture test', 'amountHt' => 100000, 'vatRate' => 2000, 'status' => 'sent']);
        self::assertSame(201, $this->httpStatus());
        self::assertSame(120000, $f['amountTtc']);
        self::assertSame('sent', $f['status']);

        // Pas de paiement sur un devis ni sur un brouillon
        $draft = $this->json('POST', "/api/sites/$villa/finances", $sophie, ['kind' => 'facture', 'title' => 'Brouillon', 'amountHt' => 100, 'vatRate' => 2000]);
        $this->json('POST', '/api/finances/'.$draft['id'].'/payments', $sophie, ['amount' => 50, 'paidOn' => date('Y-m-d'), 'method' => 'virement']);
        self::assertSame(422, $this->httpStatus());

        $d = $this->json('POST', '/api/finances/'.$f['id'].'/payments', $sophie, ['amount' => 20000, 'paidOn' => date('Y-m-d'), 'method' => 'cheque']);
        self::assertSame(201, $this->httpStatus());
        self::assertSame('partially_paid', $d['status']);
        self::assertSame(100000, $d['remaining']);

        $this->json('POST', '/api/finances/'.$f['id'].'/payments', $sophie, ['amount' => 100001, 'paidOn' => date('Y-m-d'), 'method' => 'virement']);
        self::assertSame(422, $this->httpStatus(), 'surpaiement refusé');
        $this->json('POST', '/api/finances/'.$f['id'].'/payments', $sophie, ['amount' => 0, 'paidOn' => date('Y-m-d'), 'method' => 'virement']);
        self::assertSame(422, $this->httpStatus());

        $d = $this->json('POST', '/api/finances/'.$f['id'].'/payments', $sophie, ['amount' => 100000, 'paidOn' => date('Y-m-d'), 'method' => 'virement']);
        self::assertSame('paid', $d['status']);
        self::assertSame(0, $d['remaining']);
        self::assertCount(2, $d['payments']);

        // Retirer un paiement fait revenir a « payee en partie »
        $d = $this->json('DELETE', '/api/payments/'.$d['payments'][1]['id'], $sophie);
        self::assertSame(200, $this->httpStatus());
        self::assertSame('partially_paid', $d['status']);

        // Le paiement apparait dans le fil (equipe)
        $types = array_column($this->json('GET', "/api/sites/$villa/feed?limit=10", $sophie)['items'], 'type');
        self::assertContains('payment_received', $types);

        // Depense : « payee » d'un coup enregistre le solde
        $e = $this->json('POST', "/api/sites/$villa/finances", $sophie, ['kind' => 'depense', 'title' => 'Location nacelle', 'category' => 'location', 'amountHt' => 30000, 'vatRate' => 2000, 'number' => 'K-1']);
        self::assertSame('to_pay', $e['status']);
        $e = $this->json('PATCH', '/api/finances/'.$e['id'], $sophie, ['status' => 'paid']);
        self::assertSame('paid', $e['status']);
        self::assertSame(36000, $e['paid']);
        self::assertCount(1, $e['payments']);

        // Relance
        $r = $this->json('POST', '/api/finances/'.$f['id'].'/reminders', $sophie, ['channel' => 'email', 'note' => 'Relance amiable']);
        self::assertSame(201, $this->httpStatus());
        self::assertSame(1, $r['remindersCount']);
        self::assertSame('email', $r['reminders'][0]['channel']);
    }

    public function testInvoiceFromQuoteNeverExceedsHundredPercent(): void
    {
        $sophie = $this->login(self::SOPHIE);
        $loft = $this->siteId($sophie, 'Loft Saint-Ouen');
        $q = $this->json('POST', "/api/sites/$loft/finances", $sophie, ['kind' => 'devis', 'title' => 'Cuisine', 'amountHt' => 1000000, 'vatRate' => 1000, 'status' => 'sent']);

        // Un devis non accepte ne se facture pas
        $this->json('POST', '/api/finances/'.$q['id'].'/invoice', $sophie, ['percent' => 30]);
        self::assertSame(409, $this->httpStatus());

        $q = $this->json('PATCH', '/api/finances/'.$q['id'], $sophie, ['status' => 'accepted']);
        $a = $this->json('POST', '/api/finances/'.$q['id'].'/invoice', $sophie, ['percent' => 30]);
        self::assertSame(201, $this->httpStatus());
        self::assertSame(300000, $a['amountHt']);
        self::assertSame(1000, $a['vatRate']);
        self::assertSame('draft', $a['status']);
        self::assertSame($q['id'], $a['quoteId']);
        self::assertStringStartsWith('Acompte 30 %', $a['title']);

        $s = $this->json('POST', '/api/finances/'.$q['id'].'/invoice', $sophie, ['percent' => 50]);
        self::assertStringStartsWith('Situation n°1', $s['title']);

        $this->json('POST', '/api/finances/'.$q['id'].'/invoice', $sophie, ['percent' => 21]);
        self::assertSame(422, $this->httpStatus(), '30 + 50 + 21 > 100 %');

        $solde = $this->json('POST', '/api/finances/'.$q['id'].'/invoice', $sophie, []);
        self::assertSame(200000, $solde['amountHt']);
        self::assertStringStartsWith('Solde', $solde['title']);

        $this->json('POST', '/api/finances/'.$q['id'].'/invoice', $sophie, []);
        self::assertSame(422, $this->httpStatus(), 'déjà entièrement facturé');

        $detail = $this->json('GET', '/api/finances/'.$q['id'], $sophie);
        self::assertEquals(1.0, $detail['invoicedPercent']);
        self::assertCount(3, $detail['invoices']);
    }

    public function testCompaniesAreIsolatedAndCsvExport(): void
    {
        $sophie = $this->login(self::SOPHIE);
        $julien = $this->login(self::JULIEN);
        $any = $this->json('GET', '/api/finances', $sophie)['items'][0];
        $this->json('GET', '/api/finances/'.$any['id'], $julien);
        self::assertSame(404, $this->httpStatus(), 'une autre entreprise ne voit rien');
        foreach ($this->json('GET', '/api/finances', $julien)['items'] as $f) {
            self::assertContains($f['siteName'], ['Atelier Oberkampf', 'Appartement Bastille', 'Boutique Charonne']);
        }

        $villa = $this->siteId($sophie, 'Villa Marceau');
        $this->client->request('GET', "/api/finances/export.csv?siteId=$villa", [], [], ['HTTP_AUTHORIZATION' => 'Bearer '.$sophie]);
        $resp = $this->client->getResponse();
        self::assertSame(200, $resp->getStatusCode());
        self::assertStringContainsString('text/csv', (string) $resp->headers->get('Content-Type'));
        $csv = (string) $resp->getContent();
        self::assertStringStartsWith("\xEF\xBB\xBF", $csv);
        $lines = array_values(array_filter(explode("\n", substr($csv, 3))));
        self::assertSame('Type;Numéro;Date;Chantier;Tiers;Libellé;HT;TVA;TTC;Payé;Reste;Statut;Échéance', $lines[0]);
        self::assertStringContainsString('186000,00', $csv, 'montants en euros avec virgule');
        self::assertStringContainsString('Villa Marceau', $lines[1]);

        $this->client->request('GET', '/api/finances/export.csv', [], [], ['HTTP_AUTHORIZATION' => 'Bearer '.$this->login(self::MEHDI)]);
        self::assertSame(403, $this->client->getResponse()->getStatusCode());
    }

    public function testTodayAndDocumentLink(): void
    {
        $sophie = $this->login(self::SOPHIE);
        $kinds = array_column($this->json('GET', '/api/today', $sophie)['items'], 'kind');
        self::assertContains('invoice_overdue', $kinds);
        self::assertNotContains('invoice_overdue', array_column($this->json('GET', '/api/today', $this->login(self::MEHDI))['items'], 'kind'));

        // Le document de la situation n°4 renvoie a sa facture
        $villa = $this->siteId($sophie, 'Villa Marceau');
        $docs = $this->json('GET', "/api/sites/$villa/documents", $sophie)['items'];
        $doc = array_values(array_filter($docs, fn ($d) => str_starts_with($d['title'], 'Situation de travaux n°4')))[0];
        $d = $this->json('GET', '/api/documents/'.$doc['id'], $sophie);
        self::assertSame('facture', $d['finance']['kind']);
        self::assertMatchesRegularExpression('/^F-\d{4}-\d{4}$/', $d['finance']['number']);
        self::assertNull($this->json('GET', '/api/documents/'.$doc['id'], $this->login(self::MEHDI))['finance']);
    }

    private function lastInvoiceNumber(string $token, string $year): int
    {
        $max = 0;
        foreach ($this->json('GET', '/api/finances?kind=facture', $token)['items'] as $f) {
            if ($f['number'] && str_starts_with($f['number'], "F-$year-")) {
                $max = max($max, (int) substr($f['number'], -4));
            }
        }
        return $max;
    }
}
