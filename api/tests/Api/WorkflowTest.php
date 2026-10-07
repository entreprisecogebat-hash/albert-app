<?php

namespace App\Tests\Api;

use App\Entity\ShareLink;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\HttpFoundation\File\UploadedFile;
use Symfony\Component\Uid\Uuid;

/** Pointage, tableau du jour, import CSV, partage externe, DOE. */
final class WorkflowTest extends ApiTestCase
{
    public function testClockInOutIsIdempotentAndSingleOpen(): void
    {
        $mehdi = $this->login('0633445566');
        $villa = $this->siteId($mehdi, 'Villa Marceau');
        $tilleuls = $this->siteId($mehdi, 'Résidence Les Tilleuls');

        $cid = (string) Uuid::v4();
        $in = $this->json('POST', "/api/sites/$villa/clock/in", $mehdi, ['latitude' => 48.8950, 'longitude' => 2.2874, 'clientId' => $cid]);
        self::assertSame(201, $this->httpStatus());
        self::assertNull($in['endedAt']);
        self::assertLessThan(100, $in['startDistance'], 'environ 44 m du chantier');

        $again = $this->json('POST', "/api/sites/$villa/clock/in", $mehdi, ['clientId' => $cid]);
        self::assertSame($in['id'], $again['id'], 'rejeu hors ligne sans doublon');

        // Arriver sur un autre chantier ferme le pointage precedent
        $other = $this->json('POST', "/api/sites/$tilleuls/clock/in", $mehdi, ['latitude' => 48.95, 'longitude' => 2.40]);
        self::assertSame(201, $this->httpStatus());
        self::assertGreaterThan(5000, $other['startDistance']);
        $state = $this->json('GET', '/api/clock', $mehdi);
        self::assertSame($other['id'], $state['open']['id']);
        self::assertGreaterThan(0, $state['weekMinutes']);

        $oid = (string) Uuid::v4();
        $out = $this->json('POST', '/api/clock/out', $mehdi, ['clientId' => $oid]);
        self::assertSame(200, $this->httpStatus());
        self::assertNotNull($out['endedAt']);
        self::assertNotNull($out['minutes']);
        self::assertSame($out['id'], $this->json('POST', '/api/clock/out', $mehdi, ['clientId' => $oid])['id']);
        $this->json('POST', '/api/clock/out', $mehdi, []);
        self::assertSame(409, $this->httpStatus());

        // Le compagnon ne voit que ses pointages, le responsable toute l'equipe
        foreach ($this->json('GET', "/api/sites/$villa/time-entries", $mehdi)['items'] as $e) {
            self::assertSame('Mehdi', $e['user']['firstName']);
        }
        $names = array_unique(array_map(fn ($e) => $e['user']['firstName'], $this->json('GET', "/api/sites/$villa/time-entries?from=".urlencode((new \DateTimeImmutable('-14 days'))->format(DATE_ATOM)), $this->login('0622334455'))['items']));
        self::assertGreaterThan(1, count($names));
    }

    public function testTodayBoardForSophie(): void
    {
        $d = $this->json('GET', '/api/today', $this->login('0622334455'));
        self::assertSame(200, $this->httpStatus());
        self::assertSame('rules', $d['generatedBy']);
        self::assertStringStartsWith('Bon', $d['greeting']);
        $kinds = array_column($d['items'], 'kind');
        foreach (['task_overdue', 'client_waiting', 'reserve_overdue', 'intervention_unsigned'] as $k) {
            self::assertContains($k, $kinds, $k);
        }
        // Urgent d'abord
        $urgency = array_column($d['items'], 'urgency');
        $firstNormal = array_search('normal', $urgency, true);
        if ($firstNormal !== false) {
            self::assertNotContains('high', array_slice($urgency, $firstNormal));
        }
        foreach ($d['items'] as $i) {
            self::assertMatchesRegularExpression('#^/(chantiers|reserves|interventions|documents|agenda|finances)#', $i['link']);
        }
        self::assertGreaterThan(0, $d['stats']['openTasks']);
    }

    public function testTodayBoardForClientShowsOnlyHisSite(): void
    {
        $d = $this->json('GET', '/api/today', $this->login('0611223344'));
        self::assertNull($d['clock']['open']);
        foreach ($d['items'] as $i) {
            self::assertNotContains($i['kind'], ['task_overdue', 'task_today', 'client_waiting', 'intervention_unsigned', 'clock_open']);
            self::assertSame('Maison Garnier', $i['site']['name']);
        }
    }

    public function testCsvImportDetectsSeparatorAndDeduplicates(): void
    {
        $karim = $this->login('0612345678');
        $csv = "\xEF\xBB\xBFNom;Société;Type;Téléphone;E-mail;Adresse;Commentaire\n"
            ."Jeanne Petit;;Prospect;06 01 02 03 04;jeanne.petit@example.fr;3 rue Haute, Nanterre;Salle de bain\n"
            ."Point.P Levallois;Point.P;Fournisseur;01 41 05 62 00;levallois@pointp.fr;;Mise à jour\n"
            .";;Client;;;;\n"
            ."Bruno Faux;;Client;;pas-un-email;;\n"
            ."Archi Nord;Atelier Nord;Architecte;;contact@ateliernord.fr;;\n";
        $path = tempnam(sys_get_temp_dir(), 'csv');
        file_put_contents($path, $csv);
        $this->client->request('POST', '/api/contacts/import', [], ['file' => new UploadedFile($path, 'contacts.csv', 'text/csv', null, true)], [
            'HTTP_AUTHORIZATION' => 'Bearer '.$karim, 'HTTP_ACCEPT' => 'application/json',
        ]);
        self::assertSame(200, $this->httpStatus());
        $r = json_decode((string) $this->client->getResponse()->getContent(), true);
        self::assertSame(2, $r['created'], 'Jeanne Petit et Archi Nord');
        self::assertSame(1, $r['updated'], 'Point.P reconnu par son email');
        self::assertCount(2, $r['skipped']);
        self::assertSame([4, 5], array_column($r['skipped'], 'line'));

        $found = $this->json('GET', '/api/contacts?q=ateliernord', $karim)['items'];
        self::assertCount(1, $found);
        self::assertSame('partenaire', $found[0]['kind']);
        $jeanne = $this->json('GET', '/api/contacts?q=jeanne', $karim)['items'][0];
        self::assertSame('+33601020304', $jeanne['phone']);
        self::assertSame('prospect', $jeanne['kind']);

        // Separateur virgule
        file_put_contents($path, "name,company,email\nJeanne Petit,,jeanne.petit@example.fr\n");
        $this->client->request('POST', '/api/contacts/import', [], ['file' => new UploadedFile($path, 'c.csv', 'text/csv', null, true)], [
            'HTTP_AUTHORIZATION' => 'Bearer '.$karim, 'HTTP_ACCEPT' => 'application/json',
        ]);
        $r = json_decode((string) $this->client->getResponse()->getContent(), true);
        self::assertSame(['created' => 0, 'updated' => 1], ['created' => $r['created'], 'updated' => $r['updated']]);
    }

    public function testPublicShareLinkExpiresAndRevokes(): void
    {
        $sophie = $this->login('0622334455');
        $villa = $this->siteId($sophie, 'Villa Marceau');
        $doc = $this->json('GET', "/api/sites/$villa/documents?q=calepinage", $sophie)['items'][0];

        $this->json('POST', '/api/documents/'.$doc['id'].'/shares', $this->login('0633445566'), ['days' => 7]);
        self::assertSame(403, $this->httpStatus(), 'un compagnon ne crée pas de lien');

        $link = $this->json('POST', '/api/documents/'.$doc['id'].'/shares', $sophie, ['days' => 7]);
        self::assertSame(201, $this->httpStatus());
        self::assertTrue($link['active']);
        $path = parse_url($link['url'], PHP_URL_PATH);

        $this->client->request('GET', $path);
        self::assertSame(200, $this->httpStatus());
        self::assertStringContainsString('Plan de calepinage', (string) $this->client->getResponse()->getContent());
        $this->client->request('GET', $path.'/file');
        self::assertSame(200, $this->httpStatus());

        // Expiration
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $entity = $em->getRepository(ShareLink::class)->find(Uuid::fromString($link['id']));
        $entity->setExpiresAt(new \DateTimeImmutable('-1 minute'));
        $em->flush();
        $this->client->request('GET', $path);
        self::assertSame(410, $this->httpStatus());
        $this->client->request('GET', $path.'/file');
        self::assertSame(410, $this->httpStatus());

        // Revocation
        $link2 = $this->json('POST', '/api/documents/'.$doc['id'].'/shares', $sophie, ['days' => 1]);
        $this->json('DELETE', '/api/shares/'.$link2['id'], $sophie);
        self::assertSame(200, $this->httpStatus());
        $this->client->request('GET', parse_url($link2['url'], PHP_URL_PATH));
        self::assertSame(410, $this->httpStatus());

        $this->client->request('GET', '/s/'.str_repeat('x', 43));
        self::assertSame(404, $this->httpStatus());
    }

    public function testDoeGenerationAndTransmission(): void
    {
        $sophie = $this->login('0622334455');
        $site = $this->siteId($sophie, 'Villa Marceau');
        $this->json('POST', "/api/sites/$site/doe/share", $sophie);
        self::assertSame(409, $this->httpStatus(), 'pas de DOE encore');

        $doe = $this->json('POST', "/api/sites/$site/doe", $sophie);
        self::assertSame(201, $this->httpStatus());
        self::assertNotNull($doe['documentId']);
        self::assertNotNull($doe['zipUrl']);
        self::assertSame('plans', $doe['sections'][0]['key']);

        $shared = $this->json('POST', "/api/sites/$site/doe/share", $sophie, ['days' => 30]);
        self::assertTrue($shared['share']['active']);

        $client = $this->json('GET', "/api/sites/$site/doe", $this->login('0698765432'));
        self::assertNull($client['share'], 'le lien de transmission reste côté équipe');
        self::assertSame($doe['documentId'], $client['documentId']);
    }

    public function testChannelSummaryFindsTheOpenQuestion(): void
    {
        $sophie = $this->login('0622334455');
        $site = $this->json('GET', '/api/sites/'.$this->siteId($sophie, 'Villa Marceau'), $sophie);
        $client = array_values(array_filter($site['channels'], fn ($c) => $c['kind'] === 'client'))[0];
        $s = $this->json('GET', '/api/channels/'.$client['id'].'/summary', $sophie);
        self::assertSame('rules', $s['generatedBy']);
        self::assertGreaterThan(5, $s['messagesCount']);
        self::assertSame('Est-ce qu’on tient toujours la livraison du 15 ?', end($s['openQuestions'])['body']);
        self::assertNotEmpty($s['keyPoints']);
        self::assertStringContainsString('attend une réponse', $s['text']);
    }
}
