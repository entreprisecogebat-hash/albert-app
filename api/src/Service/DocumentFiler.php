<?php

namespace App\Service;

use App\Classification\TitleNormalizer;
use App\Entity\Document;
use App\Entity\DocumentVersion;
use App\Entity\Folder;
use App\Entity\Site;
use App\Entity\User;
use App\Storage\FileStorage;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Uid\Uuid;

/**
 * Range dans le chantier un fichier produit par Albert (fiche d'intervention signee, DOE).
 * Meme titre deja present : nouvelle version du meme document (versioning normal, F-04).
 * N'ecrit pas dans le fil : l'appelant enregistre son propre evenement (intervention_signed, doe_generated).
 */
final class DocumentFiler
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly FileStorage $storage,
    ) {}

    public function file(
        Site $site,
        string $folderKind,
        string $title,
        string $type,
        string $filename,
        string $bytes,
        ?User $by,
        string $visibility,
        ?\DateTimeImmutable $at = null,
        ?string $comment = null,
    ): Document {
        $normalized = TitleNormalizer::normalize($title);
        $doc = $this->em->getRepository(Document::class)->findOneBy(['site' => $site, 'normalizedTitle' => $normalized]);
        if (!$doc) {
            $doc = new Document($site, $this->folder($site, $folderKind), $title, $normalized, $type, $by);
            $doc->setClassifiedBy('rule');
            $doc->setVisibility($visibility);
            $this->em->persist($doc);
        }
        $key = sprintf('%s/%s/%s/%s.pdf', $site->getCompany()->getId(), $site->getId(), date('Y/m'), Uuid::v7()->toRfc4122());
        $this->storage->putContents($key, $bytes);
        $number = $doc->nextVersionNumber();
        $version = new DocumentVersion(
            $doc, $number, 'V'.$number, $key, $filename, 'application/pdf', strlen($bytes), hash('sha256', $bytes),
            $comment, $by, null, $at,
        );
        $this->em->persist($version);
        $doc->addVersion($version);
        return $doc;
    }

    public function folder(Site $site, string $kind): Folder
    {
        $repo = $this->em->getRepository(Folder::class);
        $folder = $repo->findOneBy(['site' => $site, 'kind' => $kind])
            ?? $repo->findOneBy(['site' => $site, 'kind' => 'divers'])
            ?? $repo->findOneBy(['site' => $site], ['position' => 'ASC']);
        if (!$folder) {
            $folder = new Folder($site, 'Divers', 'divers', 99);
            $this->em->persist($folder);
        }
        return $folder;
    }
}
