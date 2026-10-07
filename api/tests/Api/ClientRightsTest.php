<?php

namespace App\Tests\Api;

/** Le client ne voit que ce qui lui est partage, et ne fait avancer que ses demandes SAV. */
final class ClientRightsTest extends ApiTestCase
{
    private const SOPHIE = '0622334455';
    private const LEFEVRE = '0698765432';
    private const GARNIER = '0611223344';

    public function testClientSeesOnlySharedReserves(): void
    {
        $sophie = $this->login(self::SOPHIE);
        $client = $this->login(self::LEFEVRE);
        $villa = $this->siteId($sophie, 'Villa Marceau');
        $tilleuls = $this->siteId($sophie, 'Résidence Les Tilleuls');

        // Une reserve reservee a l'equipe sur un chantier ou la cliente n'est pas
        $team = $this->json('POST', "/api/sites/$villa/reserves", $sophie, ['kind' => 'reserve', 'title' => 'Note interne', 'visibility' => 'team']);
        self::assertSame(201, $this->httpStatus());

        $items = $this->json('GET', "/api/reserves?siteId=$villa", $client)['items'];
        self::assertNotEmpty($items);
        foreach ($items as $r) {
            self::assertSame('client', $r['visibility']);
        }
        self::assertNotContains($team['id'], array_column($items, 'id'));

        $this->json('GET', '/api/reserves/'.$team['id'], $client);
        self::assertSame(404, $this->httpStatus());
        $this->json('GET', "/api/reserves?siteId=$tilleuls", $client);
        self::assertSame(403, $this->httpStatus(), 'chantier dont la cliente n’est pas membre');
    }

    public function testClientCanOnlyReportSavAndNotUpdate(): void
    {
        $garnier = $this->login(self::GARNIER);
        $sophie = $this->login(self::SOPHIE);
        $site = $this->siteId($garnier, 'Maison Garnier');

        $this->json('POST', "/api/sites/$site/reserves", $garnier, ['kind' => 'reserve', 'title' => 'Réserve']);
        self::assertSame(403, $this->httpStatus());

        $sav = $this->json('POST', "/api/sites/$site/reserves", $garnier, ['kind' => 'sav', 'title' => 'Volet roulant bloqué', 'visibility' => 'team', 'dueOn' => '2020-01-01']);
        self::assertSame(201, $this->httpStatus());
        self::assertSame('client', $sav['visibility'], 'le client ne peut pas masquer sa propre demande');
        self::assertNull($sav['dueOn'], 'l’échéance est fixée par l’équipe');

        $this->json('PATCH', '/api/reserves/'.$sav['id'], $garnier, ['status' => 'done']);
        self::assertSame(403, $this->httpStatus());

        $d = $this->json('PATCH', '/api/reserves/'.$sav['id'], $sophie, ['status' => 'in_progress', 'note' => 'Passage jeudi.']);
        self::assertSame(200, $this->httpStatus());
        self::assertSame('in_progress', $d['status']);
        self::assertCount(2, $d['history']);
        self::assertSame('Passage jeudi.', $d['history'][1]['note']);
    }

    public function testClientSeesSignedInterventionsOnly(): void
    {
        $sophie = $this->login(self::SOPHIE);
        $client = $this->login(self::LEFEVRE);
        $villa = $this->siteId($sophie, 'Villa Marceau');

        $all = $this->json('GET', "/api/sites/$villa/interventions", $sophie)['items'];
        $drafts = array_values(array_filter($all, fn ($i) => $i['status'] === 'draft'));
        self::assertNotEmpty($drafts);

        $seen = $this->json('GET', "/api/sites/$villa/interventions", $client)['items'];
        self::assertNotEmpty($seen);
        self::assertSame(['signed'], array_values(array_unique(array_column($seen, 'status'))));

        $this->json('GET', '/api/interventions/'.$drafts[0]['id'], $client);
        self::assertSame(404, $this->httpStatus());
        $this->json('POST', '/api/interventions/'.$drafts[0]['id'].'/sign', $client, ['signerName' => 'X', 'strokes' => [[[0, 0], [1, 1]]]]);
        self::assertSame(404, $this->httpStatus());
    }

    public function testSignatureProducesPdfAndLocksTheSheet(): void
    {
        $sophie = $this->login(self::SOPHIE);
        $client = $this->login(self::LEFEVRE);
        $villa = $this->siteId($sophie, 'Villa Marceau');
        $i = $this->json('POST', "/api/sites/$villa/interventions", $sophie, [
            'interventionOn' => date('Y-m-d'), 'title' => 'Réglage des volets', 'workDone' => 'Réglage des fins de course.', 'minutes' => 45,
        ]);
        self::assertSame(201, $this->httpStatus());
        self::assertMatchesRegularExpression('/^FI-\d{4}-\d{4}$/', $i['number']);

        $this->json('POST', '/api/interventions/'.$i['id'].'/sign', $sophie, ['signerName' => 'Claire Lefèvre', 'strokes' => [], 'width' => 300, 'height' => 120]);
        self::assertSame(422, $this->httpStatus(), 'signature vide refusée');

        $s = $this->json('POST', '/api/interventions/'.$i['id'].'/sign', $sophie, [
            'signerName' => 'Claire Lefèvre', 'strokes' => [[[0.1, 0.5], [0.4, 0.2], [0.8, 0.6]]], 'width' => 300, 'height' => 120,
        ]);
        self::assertSame(200, $this->httpStatus());
        self::assertSame('signed', $s['status']);
        self::assertNotNull($s['documentId']);

        $doc = $this->json('GET', '/api/documents/'.$s['documentId'], $client);
        self::assertSame(200, $this->httpStatus(), 'la fiche signée est partagée avec la cliente');
        self::assertSame('pv', $doc['type']);
        self::assertSame('application/pdf', $doc['current']['mimeType']);

        $this->json('PATCH', '/api/interventions/'.$i['id'], $sophie, ['title' => 'Modifié']);
        self::assertSame(409, $this->httpStatus());
    }

    public function testClientHasNoTasksNorContactsNorClock(): void
    {
        $client = $this->login(self::LEFEVRE);
        $villa = $this->siteId($client, 'Villa Marceau');
        self::assertSame([], $this->json('GET', "/api/tasks?siteId=$villa", $client)['items']);
        $this->json('POST', "/api/sites/$villa/tasks", $client, ['title' => 'x']);
        self::assertSame(403, $this->httpStatus());
        $this->json('GET', '/api/contacts', $client);
        self::assertSame(403, $this->httpStatus());
        $this->json('POST', "/api/sites/$villa/clock/in", $client, []);
        self::assertSame(403, $this->httpStatus());
        $appts = $this->json('GET', '/api/appointments', $client)['items'];
        foreach ($appts as $a) {
            self::assertNull($a['contact']);
            self::assertNull($a['notes']);
            self::assertSame('Villa Marceau', $a['site']['name']);
        }
        $counts = $this->json('GET', "/api/sites/$villa", $client)['counts'];
        self::assertSame(0, $counts['tasksOpen']);
    }

    public function testOtherCompanyCannotReachModules(): void
    {
        $julien = $this->login('0655443322');
        $sophie = $this->login(self::SOPHIE);
        $villa = $this->siteId($sophie, 'Villa Marceau');
        $reserve = $this->json('GET', "/api/reserves?siteId=$villa", $sophie)['items'][0]['id'];

        $this->json('GET', "/api/sites/$villa/interventions", $julien);
        self::assertSame(404, $this->httpStatus());
        $this->json('GET', "/api/reserves/$reserve", $julien);
        self::assertSame(404, $this->httpStatus());
        $names = array_column($this->json('GET', '/api/contacts', $julien)['items'], 'name');
        self::assertNotContains('Claire Lefèvre', $names);
    }
}
