<?php

namespace App\Service;

use App\Api\Presenter;
use App\Controller\DocumentController;
use App\Entity\Appointment;
use App\Entity\Channel;
use App\Entity\Document;
use App\Entity\FinanceEntry;
use App\Entity\Intervention;
use App\Entity\Message;
use App\Entity\Reserve;
use App\Entity\SiteMember;
use App\Entity\Task;
use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;

/**
 * Tableau de priorites du jour (F-18).
 *
 * V1 : regles codees en dur, sans IA (CDC 4.2) — ce qui est en retard, ce qui est pour aujourd'hui,
 * ce qui attend une reponse, ce qui attend une signature. L'ordre : urgent d'abord, puis le plus ancien.
 * Point d'extension : avec Company::isAiEnabled(), une brique IA pourra reformuler "summary"
 * (generatedBy = 'ai') a partir des memes items ; elle n'est pas appelee en V1.
 */
final class TodayBuilder
{
    /** Ordre d'affichage a urgence egale */
    private const RANK = [
        'clock_open' => 0, 'client_waiting' => 1, 'task_overdue' => 2, 'reserve_overdue' => 3, 'appointment' => 4,
        'task_today' => 5, 'intervention_unsigned' => 6, 'reserve_open' => 7, 'document_new' => 8,
        'invoice_overdue' => 2, 'expense_due' => 3, 'quote_pending' => 7,
    ];

    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly Presenter $present,
        private readonly UserSites $userSites,
        private readonly ClockStateBuilder $clock,
    ) {}

    public function build(User $user, ?\DateTimeImmutable $now = null): array
    {
        $now ??= new \DateTimeImmutable();
        $today = $now->setTime(0, 0);
        $tomorrow = $today->modify('+1 day');
        $memberships = $this->userSites->memberships($user);
        $sites = array_map(fn (SiteMember $m) => $m->getSite(), array_values($memberships));
        $managed = array_values(array_map(fn (SiteMember $m) => $m->getSite(), array_filter($memberships, fn (SiteMember $m) => $m->isManager())));
        $teamSites = array_values(array_map(fn (SiteMember $m) => $m->getSite(), array_filter($memberships, fn (SiteMember $m) => $m->seesTeamContent())));
        $clientSites = array_values(array_map(fn (SiteMember $m) => $m->getSite(), array_filter($memberships, fn (SiteMember $m) => !$m->seesTeamContent())));
        $items = [];
        $stats = ['activeSites' => count($sites), 'openTasks' => 0, 'openReserves' => 0, 'clientWaiting' => 0];
        $clock = $this->clock->state($user);

        // Pointage en cours
        if (!$user->isClient() && ($open = $this->clock->openEntry($user))) {
            $minutes = $open->minutes($now);
            $items[] = $this->item('clock_open:'.$open->getId(), 'clock_open',
                'Pointage en cours sur '.$open->getSite()->getName(),
                sprintf('Arrivé à %s, %s sur place. Pensez à pointer votre départ.', $open->getStartedAt()->format('G:i'), InterventionService::duration($minutes)),
                $open->getStartedAt(), $open->getSite(), sprintf('/chantiers/%s/pointage', $open->getSite()->getId()),
                $minutes > 10 * 60 || $open->getStartedAt() < $today ? 'high' : 'normal');
        }

        // Taches : les miennes, celles que j'ai confiees, et toutes celles des chantiers que je dirige
        if ($teamSites) {
            /** @var list<Task> $tasks */
            $tasks = $this->em->createQueryBuilder()->select('t', 's')->from(Task::class, 't')->join('t.site', 's')
                ->where('t.site IN (:sites)')->andWhere('t.status = :todo')
                ->setParameter('sites', $teamSites)->setParameter('todo', Task::STATUS_TODO)
                ->getQuery()->getResult();
            $managedIds = array_map(fn ($s) => (string) $s->getId(), $managed);
            $mine = array_filter($tasks, fn (Task $t) => $t->getAssignee() === $user
                || ($t->getCreatedBy() === $user && $t->getAssignee() === null)
                || (in_array((string) $t->getSite()->getId(), $managedIds, true) && $t->getAssignee() === null)
                || ($user->isAdmin() && in_array((string) $t->getSite()->getId(), $managedIds, true)));
            $stats['openTasks'] = count($mine);
            foreach ($mine as $t) {
                $due = $t->getDueOn();
                if (!$due || $due >= $tomorrow) {
                    continue;
                }
                $overdue = $due < $today;
                $who = $t->getAssignee() && $t->getAssignee() !== $user ? $t->getAssignee()->getFirstName() : null;
                $items[] = $this->item('task:'.$t->getId(), $overdue ? 'task_overdue' : 'task_today', $t->getTitle(),
                    trim(($overdue ? sprintf('En retard depuis le %s', DocumentController::frDate($due)) : 'Pour aujourd’hui').($who ? ', confiée à '.$who : '').'.'),
                    $due, $t->getSite(), sprintf('/chantiers/%s/taches', $t->getSite()->getId()),
                    $overdue || $t->getPriority() === 'urgent' ? 'high' : 'normal');
            }
        }

        // Le client attend une reponse
        if ($managed) {
            /** @var list<Channel> $waiting */
            $waiting = $this->em->createQueryBuilder()->select('c')->from(Channel::class, 'c')
                ->where('c.site IN (:sites)')->andWhere('c.kind = :k')->andWhere('c.awaitingReply = true')
                ->setParameter('sites', $managed)->setParameter('k', Channel::KIND_CLIENT)
                ->getQuery()->getResult();
            $stats['clientWaiting'] = count($waiting);
            foreach ($waiting as $c) {
                $last = $this->em->getRepository(Message::class)->findOneBy(['channel' => $c], ['createdAt' => 'DESC']);
                $items[] = $this->item('client:'.$c->getId(), 'client_waiting',
                    sprintf('%s attend une réponse', $last?->getAuthor()?->getFullName() ?? 'Le client'),
                    $last ? '« '.mb_strimwidth($last->getBody(), 0, 120, '…').' »' : null,
                    $c->getLastMessageAt(), $c->getSite(), sprintf('/chantiers/%s/messages/client', $c->getSite()->getId()), 'high');
            }
        }

        // Reserves et SAV
        if ($sites) {
            $qb = $this->em->createQueryBuilder()->select('r', 's')->from(Reserve::class, 'r')->join('r.site', 's')
                ->where('r.status != :done')->setParameter('done', Reserve::STATUS_DONE);
            $or = [];
            if ($teamSites) {
                $or[] = 'r.site IN (:team)';
                $qb->setParameter('team', $teamSites);
            }
            if ($clientSites) {
                $or[] = '(r.site IN (:cl) AND r.visibility = :vis)';
                $qb->setParameter('cl', $clientSites)->setParameter('vis', Document::VISIBILITY_CLIENT);
            }
            /** @var list<Reserve> $reserves */
            $reserves = $or ? $qb->andWhere(implode(' OR ', $or))->getQuery()->getResult() : [];
            $stats['openReserves'] = count($reserves);
            $grouped = [];
            foreach ($reserves as $r) {
                $concernsMe = $user->isClient() || $r->getAssignee() === $user
                    || in_array($r->getSite(), $managed, true);
                if (!$concernsMe) {
                    continue;
                }
                if ($r->isOverdue($today)) {
                    $items[] = $this->item('reserve:'.$r->getId(), 'reserve_overdue', $r->getTitle(),
                        sprintf('Échéance dépassée depuis le %s%s.', DocumentController::frDate($r->getDueOn()), $r->getLocation() ? ' · '.$r->getLocation() : ''),
                        $r->getDueOn(), $r->getSite(), '/reserves/'.$r->getId(), $user->isClient() ? 'normal' : 'high');
                } elseif ($r->getAssignee() === $user || $user->isClient() || $r->getKind() === 'sav') {
                    $items[] = $this->item('reserve:'.$r->getId(), 'reserve_open', $r->getTitle(),
                        ($r->getKind() === 'sav' ? 'Demande SAV' : ($r->getKind() === 'garantie' ? 'Garantie' : 'Réserve'))
                        .($r->getStatus() === Reserve::STATUS_IN_PROGRESS ? ' en cours' : ' à traiter')
                        .($r->getDueOn() ? ', pour le '.DocumentController::frDate($r->getDueOn()) : '').'.',
                        $r->getReportedAt(), $r->getSite(), '/reserves/'.$r->getId(), 'normal');
                } else {
                    $grouped[(string) $r->getSite()->getId()][] = $r;
                }
            }
            foreach ($grouped as $list) {
                $site = $list[0]->getSite();
                $items[] = $this->item('reserves:'.$site->getId(), 'reserve_open',
                    count($list) > 1 ? sprintf('%d réserves à lever', count($list)) : '1 réserve à lever',
                    implode(', ', array_map(fn (Reserve $r) => $r->getTitle(), array_slice($list, 0, 3))).(count($list) > 3 ? '…' : '.'),
                    null, $site, count($list) > 1 ? sprintf('/chantiers/%s/reserves', $site->getId()) : '/reserves/'.$list[0]->getId(), 'normal');
            }
        }

        // Rendez-vous du jour
        $appointments = [];
        $qb = $this->em->createQueryBuilder()->select('a', 's', 'c')->from(Appointment::class, 'a')->leftJoin('a.site', 's')->leftJoin('a.contact', 'c')
            ->where('a.company = :co')->andWhere('a.startsAt >= :d')->andWhere('a.startsAt < :n')
            ->setParameter('co', $user->getCompany())->setParameter('d', $today)->setParameter('n', $tomorrow)
            ->orderBy('a.startsAt', 'ASC');
        if ($user->isClient()) {
            $qb->andWhere($clientSites ? 'a.site IN (:mine)' : '1 = 0');
            if ($clientSites) {
                $qb->setParameter('mine', $clientSites);
            }
        } else {
            $qb->andWhere($sites ? '(a.site IN (:mine) OR (a.site IS NULL AND a.createdBy = :me))' : '(a.site IS NULL AND a.createdBy = :me)')->setParameter('me', $user);
            if ($sites) {
                $qb->setParameter('mine', $sites);
            }
        }
        foreach ($qb->getQuery()->getResult() as $a) {
            /** @var Appointment $a */
            $appointments[] = $this->present->appointment($a, !$user->isClient());
            if ($a->getEndsAt() && $a->getEndsAt() < $now) {
                continue;
            }
            $items[] = $this->item('appointment:'.$a->getId(), 'appointment', $a->getTitle(),
                'À '.$a->getStartsAt()->format('G:i').($a->getLocation() ? ' · '.$a->getLocation() : '').($a->getContact() && !$user->isClient() ? ' · avec '.$a->getContact()->getName() : ''),
                $a->getStartsAt(), $a->getSite(), '/agenda', 'normal');
        }

        // Fiches d'intervention a faire signer
        if ($teamSites) {
            $qb = $this->em->createQueryBuilder()->select('i', 's')->from(Intervention::class, 'i')->join('i.site', 's')
                ->where('i.site IN (:sites)')->andWhere('i.status = :draft')
                ->setParameter('sites', $teamSites)->setParameter('draft', Intervention::STATUS_DRAFT);
            foreach ($qb->getQuery()->getResult() as $i) {
                /** @var Intervention $i */
                if ($i->getAuthor() !== $user && !in_array($i->getSite(), $managed, true)) {
                    continue;
                }
                $items[] = $this->item('intervention:'.$i->getId(), 'intervention_unsigned',
                    sprintf('Faire signer la fiche %s', $i->getNumber()),
                    sprintf('%s, du %s.', $i->getTitle(), DocumentController::frDate($i->getInterventionOn())),
                    $i->getInterventionOn(), $i->getSite(), '/interventions/'.$i->getId(),
                    $i->getInterventionOn() < $today->modify('-3 days') ? 'high' : 'normal');
            }
        }

        // Finances : factures impayees echues, devis sans reponse, depenses a regler (responsables seulement)
        if ($managed) {
            /** @var list<FinanceEntry> $entries */
            $entries = $this->em->createQueryBuilder()->select('f', 's', 'c')->from(FinanceEntry::class, 'f')
                ->join('f.site', 's')->leftJoin('f.contact', 'c')
                ->where('f.site IN (:sites)')->andWhere('f.status IN (:open)')
                ->setParameter('sites', $managed)
                ->setParameter('open', [FinanceEntry::STATUS_SENT, FinanceEntry::STATUS_PARTIALLY_PAID, FinanceEntry::STATUS_TO_PAY])
                ->getQuery()->getResult();
            $soon = $today->modify('+3 days');
            foreach ($entries as $f) {
                $link = '/finances/'.$f->getId();
                if ($f->isInvoice() && $f->isOverdue($today)) {
                    $relances = $f->getRemindersCount()
                        ? sprintf(' · %d relance%s, la dernière le %s', $f->getRemindersCount(), $f->getRemindersCount() > 1 ? 's' : '', DocumentController::frDate($f->getLastReminderAt()))
                        : ' · pas encore relancée';
                    $items[] = $this->item('finance:'.$f->getId(), 'invoice_overdue',
                        sprintf('Facture %s impayée%s', $f->getNumber(), $f->getContact() ? ' par '.$f->getContact()->getName() : ''),
                        sprintf('%s TTC restant, échue depuis le %s%s.', FinanceService::euros($f->getRemaining()), DocumentController::frDate($f->getDueOn()), $relances),
                        $f->getDueOn(), $f->getSite(), $link, 'high');
                } elseif ($f->isQuote()) {
                    $expired = $f->isOverdue($today);
                    $silent = $f->getSentAt() && $f->getSentAt() < $now->modify('-10 days');
                    if (!$expired && !$silent) {
                        continue;
                    }
                    $items[] = $this->item('finance:'.$f->getId(), 'quote_pending',
                        sprintf('Devis %s sans réponse%s', $f->getNumber(), $f->getContact() ? ' de '.$f->getContact()->getName() : ''),
                        sprintf('%s · %s HT, envoyé le %s%s.', $f->getTitle(), FinanceService::euros($f->getAmountHt()),
                            DocumentController::frDate($f->getSentAt() ?? $f->getCreatedAt()), $expired ? ', validité dépassée' : ''),
                        $f->getSentAt(), $f->getSite(), $link, 'normal');
                } elseif ($f->isExpense() && $f->getDueOn() && $f->getDueOn() <= $soon) {
                    $late = $f->getDueOn() < $today;
                    $items[] = $this->item('finance:'.$f->getId(), 'expense_due',
                        sprintf('À payer : %s', $f->getContact()?->getName() ?? $f->getTitle()),
                        sprintf('%s · %s TTC, %s.', $f->getTitle(), FinanceService::euros($f->getRemaining()),
                            $late ? 'échue depuis le '.DocumentController::frDate($f->getDueOn())
                                : ($f->getDueOn()->format('Y-m-d') === $today->format('Y-m-d') ? 'à régler aujourd’hui' : 'à régler avant le '.DocumentController::frDate($f->getDueOn()))),
                        $f->getDueOn(), $f->getSite(), $link, $late ? 'high' : 'normal');
                }
            }
        }

        // Nouveaux documents depuis ma derniere visite
        foreach ($memberships as $m) {
            $since = $m->getLastSeenAt() ?? $m->getAddedAt();
            if (!$m->getLastSeenAt() && $m->getAddedAt() > $now->modify('-1 minute')) {
                continue; // membre virtuel (administrateur) : pas de reference de visite
            }
            $qb = $this->em->createQueryBuilder()->select('d')->from(Document::class, 'd')
                ->where('d.site = :s')->andWhere('d.updatedAt > :since')
                ->setParameter('s', $m->getSite())->setParameter('since', $since)
                ->orderBy('d.updatedAt', 'DESC')->setMaxResults(20);
            if (!$m->seesTeamContent()) {
                $qb->andWhere('d.visibility = :v')->setParameter('v', Document::VISIBILITY_CLIENT);
            }
            $docs = array_values(array_filter($qb->getQuery()->getResult(), fn (Document $d) => $d->getCurrentVersion()?->getUploadedBy() !== $user));
            if (!$docs) {
                continue;
            }
            $site = $m->getSite();
            $items[] = count($docs) === 1
                ? $this->item('docs:'.$site->getId(), 'document_new', $docs[0]->getTitle().' '.($docs[0]->getCurrentVersion()?->getLabel() ?? ''),
                    'Nouveau document depuis votre dernière visite.', $docs[0]->getUpdatedAt(), $site, '/documents/'.$docs[0]->getId(), 'normal')
                : $this->item('docs:'.$site->getId(), 'document_new', sprintf('%d nouveaux documents', count($docs)),
                    implode(', ', array_map(fn (Document $d) => $d->getTitle(), array_slice($docs, 0, 3))).(count($docs) > 3 ? '…' : '.'),
                    $docs[0]->getUpdatedAt(), $site, sprintf('/chantiers/%s', $site->getId()), 'normal');
        }

        usort($items, function (array $a, array $b) {
            if ($a['urgency'] !== $b['urgency']) {
                return $a['urgency'] === 'high' ? -1 : 1;
            }
            $r = self::RANK[$a['kind']] <=> self::RANK[$b['kind']];
            if ($r !== 0) {
                return $r;
            }
            // Rendez-vous dans l'ordre de la journee, le reste du plus ancien au plus recent
            return ($a['at'] ?? '9999') <=> ($b['at'] ?? '9999');
        });

        $high = count(array_filter($items, fn ($i) => $i['urgency'] === 'high'));
        $total = count($items);
        $summary = match (true) {
            $total === 0 => 'Rien à signaler aujourd’hui.',
            $high === 0 => sprintf('Rien d’urgent. %d point%s à suivre aujourd’hui.', $total, $total > 1 ? 's' : ''),
            $high === 1 => sprintf('1 point demande votre attention aujourd’hui%s.', $total > 1 ? sprintf(', %d autre%s à suivre', $total - 1, $total > 2 ? 's' : '') : ''),
            default => sprintf('%d points demandent votre attention aujourd’hui%s.', $high, $total > $high ? sprintf(', %d autre%s à suivre', $total - $high, $total - $high > 1 ? 's' : '') : ''),
        };
        $hour = (int) $now->format('G');

        return [
            'greeting' => sprintf('%s %s', $hour >= 18 ? 'Bonsoir' : 'Bonjour', $user->isClient() ? $user->getFullName() : $user->getFirstName()),
            'summary' => $summary,
            'generatedBy' => 'rules',
            'items' => array_map(function (array $i) {
                unset($i['_rank']);
                return $i;
            }, $items),
            'appointments' => $appointments,
            'clock' => $clock,
            'stats' => $stats,
        ];
    }

    private function item(string $id, string $kind, string $title, ?string $subtitle, ?\DateTimeImmutable $at, $site, string $link, string $urgency): array
    {
        return [
            'id' => $id,
            'kind' => $kind,
            'title' => $title,
            'subtitle' => $subtitle,
            'at' => Presenter::date($at),
            'site' => $this->present->siteRef($site),
            'link' => $link,
            'urgency' => $urgency,
        ];
    }
}
