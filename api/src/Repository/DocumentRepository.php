<?php

namespace App\Repository;

use App\Entity\Document;
use App\Entity\DocumentVersion;
use App\Entity\Site;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/** @extends ServiceEntityRepository<Document> */
class DocumentRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Document::class);
    }

    /** Etape 02 du classement : un fichier deja connu, a l'octet pres. */
    public function findVersionBySha(Site $site, string $sha256): ?DocumentVersion
    {
        return $this->getEntityManager()->createQueryBuilder()
            ->select('v', 'd')
            ->from(DocumentVersion::class, 'v')
            ->join('v.document', 'd')
            ->where('d.site = :s')->andWhere('v.sha256 = :h')
            ->setParameter('s', $site)->setParameter('h', $sha256)
            ->setMaxResults(1)
            ->getQuery()->getOneOrNullResult();
    }

    public function findByNormalizedTitle(Site $site, string $normalizedTitle): ?Document
    {
        return $this->findOneBy(['site' => $site, 'normalizedTitle' => $normalizedTitle], ['updatedAt' => 'DESC']);
    }

    /** @return list<Document> */
    public function search(Site $site, ?string $q, ?string $type, ?string $folderId, bool $clientOnly, int $limit = 100): array
    {
        $qb = $this->createQueryBuilder('d')
            ->leftJoin('d.currentVersion', 'v')->addSelect('v')
            ->join('d.folder', 'f')->addSelect('f')
            ->where('d.site = :s')->setParameter('s', $site)
            ->orderBy('d.updatedAt', 'DESC')
            ->setMaxResults($limit);
        if ($q) {
            $qb->andWhere('LOWER(d.title) LIKE :q OR d.normalizedTitle LIKE :qn OR LOWER(v.originalName) LIKE :q')
                ->setParameter('q', '%'.mb_strtolower($q).'%')
                ->setParameter('qn', '%'.\App\Classification\TitleNormalizer::normalize($q).'%');
        }
        if ($type) {
            $qb->andWhere('d.type = :t')->setParameter('t', $type);
        }
        if ($folderId) {
            $qb->andWhere('f.id = :f')->setParameter('f', $folderId);
        }
        if ($clientOnly) {
            $qb->andWhere('d.visibility = :vis')->setParameter('vis', Document::VISIBILITY_CLIENT);
        }
        return $qb->getQuery()->getResult();
    }

    /** @return list<DocumentVersion> */
    public function versions(Document $doc): array
    {
        return $this->getEntityManager()->createQueryBuilder()
            ->select('v')->from(DocumentVersion::class, 'v')
            ->where('v.document = :d')->setParameter('d', $doc)
            ->orderBy('v.number', 'DESC')
            ->getQuery()->getResult();
    }
}
