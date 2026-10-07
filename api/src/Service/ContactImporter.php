<?php

namespace App\Service;

use App\Entity\Company;
use App\Entity\Contact;
use Doctrine\ORM\EntityManagerInterface;

/**
 * Import de contacts depuis un export Excel « CSV UTF-8 » ou un logiciel tiers (F-01).
 * Separateur ; ou , detecte, BOM tolere, en-tetes francais souples.
 * Un contact deja connu (meme email ou meme telephone) est mis a jour, pas duplique.
 */
final class ContactImporter
{
    private const HEADERS = [
        'name' => ['nom', 'name', 'contact', 'nom complet', 'nom et prenom', 'raison sociale', 'interlocuteur'],
        'firstName' => ['prenom', 'first name', 'firstname'],
        'companyName' => ['societe', 'entreprise', 'company', 'organisation', 'structure'],
        'kind' => ['type', 'categorie', 'statut', 'kind', 'nature'],
        'phone' => ['telephone', 'tel', 'portable', 'mobile', 'phone', 'numero'],
        'email' => ['email', 'e-mail', 'mail', 'courriel', 'adresse mail', 'adresse email'],
        'address' => ['adresse', 'address', 'adresse postale'],
        'jobTitle' => ['fonction', 'poste', 'metier', 'job', 'role'],
        'notes' => ['notes', 'note', 'commentaire', 'commentaires', 'remarques', 'observations'],
    ];
    private const KINDS = [
        'prospect' => 'prospect', 'suspect' => 'prospect', 'lead' => 'prospect',
        'client' => 'client', 'clients' => 'client', 'maitre d ouvrage' => 'client', 'moa' => 'client',
        'fournisseur' => 'fournisseur', 'fournisseurs' => 'fournisseur', 'negoce' => 'fournisseur',
        'partenaire' => 'partenaire', 'architecte' => 'partenaire', 'bet' => 'partenaire', 'bureau d etudes' => 'partenaire', 'moe' => 'partenaire',
        'sous-traitant' => 'sous_traitant', 'sous traitant' => 'sous_traitant', 'sous_traitant' => 'sous_traitant', 'soustraitant' => 'sous_traitant', 'st' => 'sous_traitant',
    ];

    public function __construct(private readonly EntityManagerInterface $em) {}

    /** @return array{created: int, updated: int, skipped: list<array{line: int, reason: string}>} */
    public function import(Company $company, string $raw): array
    {
        $raw = preg_replace('/^\xEF\xBB\xBF/', '', $raw) ?? $raw;
        if (!mb_check_encoding($raw, 'UTF-8')) {
            $raw = mb_convert_encoding($raw, 'UTF-8', 'Windows-1252');
        }
        $lines = preg_split('/\r\n|\n|\r/', $raw) ?: [];
        while ($lines && trim((string) end($lines)) === '') {
            array_pop($lines);
        }
        $result = ['created' => 0, 'updated' => 0, 'skipped' => []];
        if (count($lines) < 2) {
            $result['skipped'][] = ['line' => 1, 'reason' => 'Le fichier ne contient aucune ligne de contact.'];
            return $result;
        }
        $sep = substr_count($lines[0], ';') >= substr_count($lines[0], ',') ? ';' : ',';
        if (substr_count($lines[0], "\t") > max(substr_count($lines[0], ';'), substr_count($lines[0], ','))) {
            $sep = "\t";
        }
        $map = $this->mapHeaders(str_getcsv($lines[0], $sep, '"', ''));
        if (!isset($map['name']) && !isset($map['companyName'])) {
            $result['skipped'][] = ['line' => 1, 'reason' => 'Colonne « Nom » ou « Société » introuvable dans la première ligne.'];
            return $result;
        }

        $existing = $this->em->getRepository(Contact::class)->findBy(['company' => $company]);
        $byEmail = [];
        $byPhone = [];
        foreach ($existing as $c) {
            if ($c->getEmail()) {
                $byEmail[$c->getEmail()] = $c;
            }
            if ($c->getPhone()) {
                $byPhone[$c->getPhone()] = $c;
            }
        }

        foreach (array_slice($lines, 1, 5000) as $i => $line) {
            $n = $i + 2;
            if (trim($line) === '') {
                continue;
            }
            $cells = str_getcsv($line, $sep, '"', '');
            $get = fn (string $k) => isset($map[$k]) ? trim((string) ($cells[$map[$k]] ?? '')) : '';
            $name = trim($get('firstName').' '.$get('name'));
            $companyName = $get('companyName');
            if ($name === '') {
                $name = $companyName;
            }
            if ($name === '') {
                $result['skipped'][] = ['line' => $n, 'reason' => 'Nom manquant.'];
                continue;
            }
            $email = mb_strtolower($get('email'));
            if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
                $result['skipped'][] = ['line' => $n, 'reason' => sprintf('Email invalide : %s.', $email)];
                continue;
            }
            $phoneRaw = $get('phone');
            $phone = $phoneRaw !== '' ? (PhoneNumber::normalize($phoneRaw) ?? $phoneRaw) : '';

            $contact = ($email !== '' ? ($byEmail[$email] ?? null) : null) ?? ($phone !== '' ? ($byPhone[$phone] ?? null) : null);
            $isNew = !$contact;
            if ($isNew) {
                $contact = new Contact($company, self::kind($get('kind')) ?? 'prospect', mb_substr($name, 0, 160));
                $this->em->persist($contact);
            } else {
                $contact->setName(mb_substr($name, 0, 160));
                if ($k = self::kind($get('kind'))) {
                    $contact->setKind($k);
                }
                $contact->touch();
            }
            if ($companyName !== '' && $companyName !== $name) {
                $contact->setCompanyName(mb_substr($companyName, 0, 160));
            }
            foreach (['jobTitle' => 120, 'address' => 255, 'notes' => 4000] as $k => $max) {
                if ($get($k) !== '') {
                    $contact->{'set'.ucfirst($k)}(mb_substr($get($k), 0, $max));
                }
            }
            if ($email !== '') {
                $contact->setEmail($email);
                $byEmail[$email] = $contact;
            }
            if ($phone !== '') {
                $contact->setPhone(mb_substr($phone, 0, 40));
                $byPhone[$phone] = $contact;
            }
            $isNew ? ++$result['created'] : ++$result['updated'];
        }
        return $result;
    }

    /** @return array<string, int> champ => index de colonne */
    private function mapHeaders(array $headers): array
    {
        $map = [];
        foreach ($headers as $i => $h) {
            $h = self::norm((string) $h);
            foreach (self::HEADERS as $field => $aliases) {
                if (!isset($map[$field]) && in_array($h, $aliases, true)) {
                    $map[$field] = $i;
                    continue 2;
                }
            }
        }
        return $map;
    }

    public static function kind(string $v): ?string
    {
        $v = self::norm($v);
        return $v === '' ? null : (self::KINDS[$v] ?? null);
    }

    private static function norm(string $s): string
    {
        $s = mb_strtolower(trim($s, " \t\"'"));
        $s = strtr($s, ['é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e', 'à' => 'a', 'â' => 'a', 'î' => 'i', 'ï' => 'i', 'ô' => 'o', 'û' => 'u', 'ù' => 'u', 'ç' => 'c', '’' => ' ', "'" => ' ', '.' => '']);
        return trim(preg_replace('/\s+/', ' ', $s) ?? $s);
    }
}
