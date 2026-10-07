<?php

namespace App\Tests\Assistant;

use App\Assistant\CommandParser;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/** Phrases dictees sur le chantier, et ce qu'Albert doit en comprendre. */
final class CommandParserTest extends TestCase
{
    private const SITES = [
        ['id' => 's-marceau', 'name' => 'Villa Marceau', 'clientName' => 'Mme Lefèvre'],
        ['id' => 's-voltaire', 'name' => 'Bureaux Voltaire', 'clientName' => 'Voltaire Invest'],
    ];
    private const PEOPLE = [
        ['id' => 'u-karim', 'firstName' => 'Karim', 'fullName' => 'Karim Belhadi'],
        ['id' => 'u-sophie', 'firstName' => 'Sophie', 'fullName' => 'Sophie Nadal'],
        ['id' => 'u-yanis', 'firstName' => 'Yanis', 'fullName' => 'Yanis Bonali'],
    ];

    /** Mercredi 7 octobre 2026, 10 h 30. */
    private static function now(): \DateTimeImmutable
    {
        return new \DateTimeImmutable('2026-10-07 10:30', new \DateTimeZone('Europe/Paris'));
    }

    private function parse(string $text, ?string $current = null): array
    {
        return (new CommandParser())->parse($text, self::now(), self::SITES, self::PEOPLE, 'u-karim', $current);
    }

    public function testNouveauChantierPourUnClient(): void
    {
        $r = $this->parse('Ajoute un nouveau chantier pour Zazoun');
        self::assertSame('site', $r['action']);
        self::assertSame('Zazoun', $r['fields']['name']);
        self::assertSame('Zazoun', $r['fields']['clientName']);
        self::assertSame(['address'], $r['missing']);
        self::assertSame('Créer le chantier « Zazoun »', $r['summary']);
    }

    public function testNouveauChantierAvecNomClientEtAdresse(): void
    {
        $r = $this->parse('Albert, crée un chantier Villa des Roses pour M. Dupont au 12 rue des Lilas à Levallois');
        self::assertSame('site', $r['action']);
        self::assertSame('Villa Des Roses', $r['fields']['name']);
        self::assertSame('M. Dupont', $r['fields']['clientName']);
        self::assertSame('12 rue des Lilas à Levallois', $r['fields']['address']);
        self::assertSame([], $r['missing']);
    }

    public function testTacheAvecPersonneEtJour(): void
    {
        $r = $this->parse('Rappelle à Sophie de commander les plinthes pour vendredi', 's-marceau');
        self::assertSame('task', $r['action']);
        self::assertSame('Commander les plinthes', $r['fields']['title']);
        self::assertSame('u-sophie', $r['fields']['assigneeId']);
        self::assertSame('2026-10-09', $r['fields']['dueOn']);
        self::assertSame('s-marceau', $r['fields']['siteId']);
    }

    /** Transcriptions reelles de faster-whisper : nom ecorche, trait d'union. */
    #[DataProvider('heard')]
    public function testChantierMalTranscrit(string $text): void
    {
        $r = $this->parse($text, 's-voltaire');
        self::assertSame('task', $r['action']);
        self::assertSame('s-marceau', $r['fields']['siteId']);
        self::assertSame('Commander les plinthes', $r['fields']['title']);
        self::assertSame('u-sophie', $r['fields']['assigneeId']);
    }

    /** @return iterable<array{string}> */
    public static function heard(): iterable
    {
        yield ['Rappel à Sophie de commander les plinthes pour vendredi sur Villa Marseau'];
        yield ['Rappel à Sophie de commander les plinthes pour vendredi sur Villa-Marceau'];
    }

    public function testTacheSurUnChantierNomme(): void
    {
        $r = $this->parse('Il faut vérifier les attentes électriques sur Bureaux Voltaire demain');
        self::assertSame('task', $r['action']);
        self::assertSame('Vérifier les attentes électriques', $r['fields']['title']);
        self::assertSame('s-voltaire', $r['fields']['siteId']);
        self::assertSame('2026-10-08', $r['fields']['dueOn']);
        self::assertNull($r['fields']['assigneeId']);
    }

    public function testTacheSansChantierDemandeLeChantier(): void
    {
        $r = $this->parse('Crée une tâche : commander le carrelage');
        self::assertSame('task', $r['action']);
        self::assertSame('Commander le carrelage', $r['fields']['title']);
        self::assertSame(['siteId'], $r['missing']);
    }

    public function testRendezVousAvecJourEtHeure(): void
    {
        $r = $this->parse('Réunion de chantier Villa Marceau jeudi 8 h 30');
        self::assertSame('appointment', $r['action']);
        self::assertSame('s-marceau', $r['fields']['siteId']);
        self::assertSame('Réunion de chantier', $r['fields']['title']);
        self::assertSame('2026-10-08T08:30:00+02:00', $r['fields']['startsAt']);
        self::assertSame('2026-10-08T09:30:00+02:00', $r['fields']['endsAt']);
        self::assertSame([], $r['missing']);
    }

    public function testRendezVousSansHeureProposeHuitHeures(): void
    {
        $r = $this->parse('Livraison des menuiseries le 12 octobre');
        self::assertSame('appointment', $r['action']);
        self::assertSame('Livraison des menuiseries', $r['fields']['title']);
        self::assertSame('2026-10-12T08:00:00+02:00', $r['fields']['startsAt']);
        self::assertSame(['time'], $r['missing']);
    }

    public function testMessageALEquipe(): void
    {
        $r = $this->parse('Dis à l’équipe que la livraison est décalée à jeudi', 's-marceau');
        self::assertSame('message', $r['action']);
        self::assertSame('s-marceau', $r['fields']['siteId']);
        self::assertStringStartsWith('La livraison est décalée', $r['fields']['body']);
    }

    public function testReserve(): void
    {
        $r = $this->parse('Réserve : éclat sur l’appui de fenêtre chambre 2', 's-marceau');
        self::assertSame('reserve', $r['action']);
        self::assertSame('reserve', $r['fields']['kind']);
        self::assertSame('Éclat sur l’appui de fenêtre chambre 2', $r['fields']['title']);
    }

    public function testSav(): void
    {
        $r = $this->parse('Nouveau SAV sur Bureaux Voltaire, fuite sous l’évier de la kitchenette');
        self::assertSame('reserve', $r['action']);
        self::assertSame('sav', $r['fields']['kind']);
        self::assertSame('s-voltaire', $r['fields']['siteId']);
        self::assertSame('Fuite sous l’évier de la kitchenette', $r['fields']['title']);
    }

    public function testPhraseIncomprise(): void
    {
        self::assertSame('unknown', $this->parse('Quel temps fait-il ?')['action']);
        self::assertSame('unknown', $this->parse('   ')['action']);
    }

    /** @return iterable<array{string, string}> */
    public static function days(): iterable
    {
        yield ['demain', '2026-10-08'];
        yield ['après-demain', '2026-10-09'];
        yield ['lundi', '2026-10-12'];
        yield ['mercredi', '2026-10-14'];
        yield ['dans 3 jours', '2026-10-10'];
        yield ['dans deux semaines', '2026-10-21'];
        yield ['le 3 novembre', '2026-11-03'];
        yield ['le 2 octobre', '2027-10-02'];
    }

    #[DataProvider('days')]
    public function testDates(string $when, string $expected): void
    {
        $r = $this->parse("Rappelle-moi de rappeler le plombier {$when}", 's-marceau');
        self::assertSame($expected, $r['fields']['dueOn'], $when);
        self::assertSame('Rappeler le plombier', $r['fields']['title'], $when);
    }
}
