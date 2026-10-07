<?php

namespace App\Controller;

use App\Api\Presenter;
use App\Entity\Channel;
use App\Entity\Document;
use App\Entity\Message;
use App\Entity\Photo;
use App\Entity\User;
use App\Repository\DocumentRepository;
use App\Service\SiteAccess;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

/**
 * "Une seule recherche sur tout le chantier, et les resultats disent lequel fait foi." (F-05)
 * kind : all | plan | devis | facture | pv | administratif | photos | messages
 */
final class SearchController extends AbstractController
{
    #[Route('/api/sites/{id}/search', methods: ['GET'])]
    public function search(
        #[CurrentUser] User $user,
        string $id,
        Request $request,
        SiteAccess $access,
        DocumentRepository $documents,
        EntityManagerInterface $em,
        Presenter $present,
    ): JsonResponse {
        $site = $access->site($id);
        $m = $access->member($site, $user);
        $clientOnly = !$m->seesTeamContent();
        $q = trim((string) $request->query->get('q', ''));
        $kind = (string) $request->query->get('kind', 'all');
        $like = '%'.mb_strtolower($q).'%';
        $results = [];

        if ($kind === 'all' || in_array($kind, Document::TYPES, true)) {
            $docs = $documents->search($site, $q ?: null, $kind === 'all' ? null : $kind, null, $clientOnly, 50);
            foreach ($docs as $d) {
                $results[] = ['kind' => 'document', 'at' => Presenter::date($d->getUpdatedAt()), 'document' => $present->document($d)];
            }
            // Les versions remplacees restent trouvables, marquees "Remplacee"
            if ($q !== '') {
                $old = $em->createQueryBuilder()->select('v', 'd')->from(\App\Entity\DocumentVersion::class, 'v')
                    ->join('v.document', 'd')
                    ->where('d.site = :s')->andWhere('v != d.currentVersion')
                    ->andWhere('LOWER(d.title) LIKE :q OR LOWER(v.originalName) LIKE :q')
                    ->setParameter('s', $site)->setParameter('q', $like)
                    ->orderBy('v.uploadedAt', 'DESC')->setMaxResults(20);
                if ($kind !== 'all') {
                    $old->andWhere('d.type = :t')->setParameter('t', $kind);
                }
                if ($clientOnly) {
                    $old->andWhere('d.visibility = :v')->setParameter('v', Document::VISIBILITY_CLIENT);
                }
                foreach ($old->getQuery()->getResult() as $v) {
                    $results[] = [
                        'kind' => 'version',
                        'at' => Presenter::date($v->getUploadedAt()),
                        'document' => $present->document($v->getDocument()),
                        'version' => $present->version($v, false),
                    ];
                }
            }
        }

        if ($kind === 'all' || $kind === 'photos') {
            $qb = $em->createQueryBuilder()->select('p')->from(Photo::class, 'p')
                ->where('p.site = :s')->setParameter('s', $site)
                ->orderBy('p.takenAt', 'DESC')->setMaxResults(60);
            if ($q !== '') {
                $qb->andWhere('LOWER(p.caption) LIKE :q')->setParameter('q', $like);
            }
            if ($clientOnly) {
                $qb->andWhere('p.visibility = :v')->setParameter('v', Document::VISIBILITY_CLIENT);
            }
            // Regroupement par lot, comme dans le fil
            $batches = [];
            foreach ($qb->getQuery()->getResult() as $p) {
                $batches[(string) $p->getBatchId()][] = $p;
            }
            foreach ($batches as $batch) {
                $results[] = [
                    'kind' => 'photos',
                    'at' => Presenter::date($batch[0]->getTakenAt()),
                    'caption' => $batch[0]->getCaption(),
                    'photos' => array_map(fn (Photo $p) => $present->photo($p), $batch),
                ];
            }
        }

        if (($kind === 'all' || $kind === 'messages') && $q !== '') {
            $qb = $em->createQueryBuilder()->select('m', 'c', 'a')->from(Message::class, 'm')
                ->join('m.channel', 'c')->leftJoin('m.author', 'a')
                ->where('c.site = :s')->andWhere('LOWER(m.body) LIKE :q')
                ->setParameter('s', $site)->setParameter('q', $like)
                ->orderBy('m.createdAt', 'DESC')->setMaxResults(30);
            if ($clientOnly) {
                $qb->andWhere('c.kind = :k')->setParameter('k', Channel::KIND_CLIENT);
            }
            foreach ($qb->getQuery()->getResult() as $msg) {
                $results[] = ['kind' => 'message', 'at' => Presenter::date($msg->getCreatedAt()), 'message' => $present->message($msg, $user)];
            }
        }

        // Le document qui fait foi d'abord, puis le plus recent.
        usort($results, function ($a, $b) {
            $rank = fn ($r) => match ($r['kind']) { 'document' => 0, 'version' => 1, default => 2 };
            if ($a['kind'] !== $b['kind'] && ($rank($a) < 2 || $rank($b) < 2)) {
                return $rank($a) <=> $rank($b);
            }
            return strcmp((string) $b['at'], (string) $a['at']);
        });

        return $this->json(['items' => $results, 'query' => $q, 'kind' => $kind]);
    }
}
