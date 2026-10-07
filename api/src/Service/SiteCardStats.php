<?php

namespace App\Service;

use App\Entity\Appointment;
use App\Entity\Document;
use App\Entity\FinanceEntry;
use App\Entity\Photo;
use App\Entity\Reserve;
use App\Entity\Site;
use App\Entity\SiteMember;
use App\Entity\Task;
use App\Storage\UrlSigner;
use Doctrine\ORM\EntityManagerInterface;

/**
 * Ce qu'une carte chantier montre d'un coup d'oeil : avancement, alertes, photo, prochain rendez-vous.
 * Calcule en quelques requetes groupees pour toute la liste "Mes chantiers" (pas une requete par carte).
 */
final class SiteCardStats
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly UrlSigner $signer,
    ) {}

    /**
     * @param list<SiteMember> $memberships
     * @return array<string, array{progress: ?array, alerts: int, cover: ?string, nextAppointment: ?array}>
     */
    public function forMemberships(array $memberships): array
    {
        $sites = array_map(fn (SiteMember $m) => $m->getSite(), $memberships);
        if (!$sites) {
            return [];
        }
        $today = new \DateTimeImmutable('today');
        $out = [];
        foreach ($sites as $s) {
            $out[(string) $s->getId()] = ['progress' => null, 'alerts' => 0, 'cover' => null, 'nextAppointment' => null];
        }

        // Taches : faites / total, et en retard
        $tasks = [];
        foreach ($this->em->createQueryBuilder()->select('t')->from(Task::class, 't')->where('t.site IN (:s)')->setParameter('s', $sites)->getQuery()->getResult() as $t) {
            /** @var Task $t */
            $id = (string) $t->getSite()->getId();
            $tasks[$id]['total'] = ($tasks[$id]['total'] ?? 0) + 1;
            $tasks[$id]['done'] = ($tasks[$id]['done'] ?? 0) + ($t->isDone() ? 1 : 0);
            $tasks[$id]['late'] = ($tasks[$id]['late'] ?? 0) + ($t->isOverdue($today) ? 1 : 0);
        }

        // Reserves en retard
        $lateReserves = [];
        foreach ($this->em->createQueryBuilder()->select('r')->from(Reserve::class, 'r')->where('r.site IN (:s)')->setParameter('s', $sites)
            ->andWhere('r.status != :done')->setParameter('done', Reserve::STATUS_DONE)->getQuery()->getResult() as $r) {
            /** @var Reserve $r */
            if ($r->isOverdue($today)) {
                $id = (string) $r->getSite()->getId();
                $lateReserves[$id] = ($lateReserves[$id] ?? 0) + 1;
            }
        }

        // Finances : part facturee des devis acceptes
        $billing = [];
        foreach ($this->em->createQueryBuilder()->select('f')->from(FinanceEntry::class, 'f')->where('f.site IN (:s)')->setParameter('s', $sites)
            ->andWhere('f.kind IN (:k)')->setParameter('k', [FinanceEntry::KIND_QUOTE, FinanceEntry::KIND_INVOICE])->getQuery()->getResult() as $f) {
            /** @var FinanceEntry $f */
            $id = (string) $f->getSite()->getId();
            if ($f->isQuote() && $f->getStatus() === FinanceEntry::STATUS_ACCEPTED) {
                $billing[$id]['quoted'] = ($billing[$id]['quoted'] ?? 0) + $f->getAmountHt();
            } elseif ($f->isInvoice() && !$f->isDraft()) {
                $billing[$id]['invoiced'] = ($billing[$id]['invoiced'] ?? 0) + $f->getAmountHt();
            }
        }

        // Prochain rendez-vous
        foreach ($this->em->createQueryBuilder()->select('a')->from(Appointment::class, 'a')->where('a.site IN (:s)')->setParameter('s', $sites)
            ->andWhere('a.startsAt >= :now')->setParameter('now', new \DateTimeImmutable())->orderBy('a.startsAt', 'ASC')->getQuery()->getResult() as $a) {
            /** @var Appointment $a */
            $id = (string) $a->getSite()->getId();
            $out[$id]['nextAppointment'] ??= ['title' => $a->getTitle(), 'startsAt' => $a->getStartsAt()->format(\DateTimeInterface::ATOM)];
        }

        foreach ($memberships as $m) {
            $site = $m->getSite();
            $id = (string) $site->getId();
            $client = !$m->seesTeamContent();

            // Avancement
            $b = $billing[$id] ?? [];
            if ($site->getPhase() === Site::PHASE_AFTER) {
                $out[$id]['progress'] = ['value' => 1.0, 'label' => $site->getDeliveredOn() ? 'Livré le '.\App\Controller\DocumentController::frDate($site->getDeliveredOn()) : 'Livré'];
            } elseif ($m->isManager() && ($b['quoted'] ?? 0) > 0) {
                $v = min(1, ($b['invoiced'] ?? 0) / $b['quoted']);
                $out[$id]['progress'] = ['value' => round($v, 3), 'label' => sprintf('Facturé à %d %%', round($v * 100))];
            } elseif (!$client && ($tasks[$id]['total'] ?? 0) > 0) {
                $tk = $tasks[$id];
                $out[$id]['progress'] = ['value' => round($tk['done'] / $tk['total'], 3), 'label' => sprintf('%d tâche%s sur %d', $tk['done'], $tk['done'] > 1 ? 's' : '', $tk['total'])];
            }

            if (!$client) {
                $out[$id]['alerts'] = ($tasks[$id]['late'] ?? 0) + ($lateReserves[$id] ?? 0);
            }

            // Photo de couverture : la plus recente que ce membre peut voir
            $qb = $this->em->createQueryBuilder()->select('p')->from(Photo::class, 'p')->where('p.site = :s')->setParameter('s', $site)
                ->orderBy('p.takenAt', 'DESC')->setMaxResults(1);
            if ($client) {
                $qb->andWhere('p.visibility = :v')->setParameter('v', Document::VISIBILITY_CLIENT);
            }
            $photo = $qb->getQuery()->getOneOrNullResult();
            if ($photo instanceof Photo) {
                $out[$id]['cover'] = $this->signer->sign($photo->getThumbKey() ?? $photo->getFileKey());
            }
        }
        return $out;
    }
}
