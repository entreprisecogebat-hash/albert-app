<?php

namespace App\Classification;

use App\Entity\ClassificationRule;
use App\Entity\Document;
use App\Entity\Folder;
use App\Entity\Site;
use App\Repository\DocumentRepository;
use Doctrine\ORM\EntityManagerInterface;

/**
 * Classement d'un document au depot, sans appel a un modele (V1 de base).
 * Proposition Sooyoos, slide 17 : les filtres gratuits passent dans l'ordre, on s'arrete des qu'on sait.
 *   01 Regles de depot : nom du fichier compare aux regles de l'entreprise.
 *   02 Empreinte       : fichier deja connu a l'octet pres (doublon).
 *   +  Titre           : meme titre sans indice de version -> nouvelle version d'un document existant.
 * L'etape 03 (texte du PDF) et 04 (modele IA) relevent de l'option IA, non incluse.
 */
final class DocumentClassifier
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly DocumentRepository $documents,
    ) {}

    public function classify(Site $site, string $filename, ?string $sha256, ?string $mimeType = null): ClassificationProposal
    {
        $title = TitleNormalizer::displayTitle($filename);
        $normalized = TitleNormalizer::normalize($filename);
        $version = TitleNormalizer::extractVersion($filename);

        // 02 Empreinte : deja depose, a l'identique
        if ($sha256) {
            $dup = $this->documents->findVersionBySha($site, $sha256);
            if ($dup) {
                $doc = $dup->getDocument();
                return new ClassificationProposal(
                    $doc->getTitle(), $doc->getNormalizedTitle(), $doc->getType(), $doc->getFolder(),
                    $dup->getNumber(), $dup->getLabel(), 'fingerprint', $doc, $dup,
                );
            }
        }

        // 01 Regles de depot
        $rule = $this->matchRule($site, $filename);

        // Rattachement a un document existant par son titre
        $existing = $normalized !== '' ? $this->documents->findByNormalizedTitle($site, $normalized) : null;

        if ($existing) {
            $number = $existing->nextVersionNumber();
            if ($version['number'] !== null && $version['number'] > $existing->getVersionsCount()) {
                $number = $version['number'];
            }
            // L'indice lu dans le nom ne sert que s'il fait avancer la série : jamais deux "V3".
            $label = $number === $version['number'] ? $version['label'] : 'V'.$number;
            return new ClassificationProposal(
                $existing->getTitle(), $existing->getNormalizedTitle(), $existing->getType(), $existing->getFolder(),
                $number, $label, $rule ? 'rule' : 'title', $existing, null, $rule?->getId()->toRfc4122(),
            );
        }

        if ($rule) {
            $folder = $this->folderOfKind($site, $rule->getFolderKind());
            $number = $version['number'] ?? 1;
            return new ClassificationProposal(
                $title, $normalized, $rule->getType(), $folder, $number, $version['label'] ?? 'V'.$number,
                'rule', null, null, $rule->getId()->toRfc4122(),
            );
        }

        // Par defaut : images dans Photos, le reste dans Divers. Albert ne bloque jamais le depot.
        $isImage = $mimeType && str_starts_with($mimeType, 'image/');
        $folder = $this->folderOfKind($site, $isImage ? 'photos' : 'divers');
        $number = $version['number'] ?? 1;
        return new ClassificationProposal(
            $title, $normalized, $isImage ? 'photo' : 'autre', $folder, $number, $version['label'] ?? 'V'.$number, 'default',
        );
    }

    public function matchRule(Site $site, string $filename): ?ClassificationRule
    {
        $name = TitleNormalizer::normalizeName($filename);
        /** @var list<ClassificationRule> $rules */
        $rules = $this->em->getRepository(ClassificationRule::class)
            ->findBy(['company' => $site->getCompany()], ['priority' => 'ASC']);
        foreach ($rules as $rule) {
            if ($rule->matches($name)) {
                return $rule;
            }
        }
        return null;
    }

    public function folderOfKind(Site $site, string $kind): Folder
    {
        $repo = $this->em->getRepository(Folder::class);
        $folder = $repo->findOneBy(['site' => $site, 'kind' => $kind], ['position' => 'ASC'])
            ?? $repo->findOneBy(['site' => $site, 'kind' => 'divers'])
            ?? $repo->findOneBy(['site' => $site], ['position' => 'ASC']);
        if (!$folder) {
            throw new \LogicException('Chantier sans arborescence.');
        }
        return $folder;
    }

    /** Type de document associe a un dossier, quand l'utilisateur deplace un document. */
    public static function typeForFolderKind(string $kind): string
    {
        return match ($kind) {
            'plans' => 'plan',
            'devis' => 'devis',
            'factures' => 'facture',
            'pv' => 'pv',
            'photos' => 'photo',
            'administratif' => 'administratif',
            default => 'autre',
        };
    }

    public static function folderKindForType(string $type): string
    {
        return match ($type) {
            'plan' => 'plans',
            'devis' => 'devis',
            'facture' => 'factures',
            'pv' => 'pv',
            'photo' => 'photos',
            'administratif' => 'administratif',
            default => 'divers',
        };
    }

    public static function typeLabel(string $type): string
    {
        return match ($type) {
            'plan' => 'un plan',
            'devis' => 'un devis',
            'facture' => 'une facture',
            'pv' => 'un PV',
            'photo' => 'une photo',
            'administratif' => 'un document administratif',
            default => 'un document',
        };
    }

    public static function isDocumentType(string $t): bool
    {
        return in_array($t, Document::TYPES, true);
    }
}
