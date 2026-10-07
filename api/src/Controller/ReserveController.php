<?php

namespace App\Controller;

use App\Api\ApiProblem;
use App\Api\Input;
use App\Api\Presenter;
use App\Entity\ActivityEvent;
use App\Entity\Document;
use App\Entity\Photo;
use App\Entity\Reserve;
use App\Entity\ReserveEvent;
use App\Entity\Site;
use App\Entity\SiteMember;
use App\Entity\User;
use App\Repository\SiteMemberRepository;
use App\Service\ActivityRecorder;
use App\Service\Notifier;
use App\Service\SiteAccess;
use App\Service\UserSites;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;
use Symfony\Component\Uid\Uuid;

/**
 * Reserves de reception, SAV et garanties (F-15).
 * Le client voit les reserves qui lui sont partagees et peut signaler une demande SAV ;
 * seule l'equipe fait avancer le traitement.
 */
final class ReserveController extends AbstractController
{
    private const STATUS_LABELS = ['open' => 'À traiter', 'in_progress' => 'En cours', 'done' => 'Levée'];
    private const KIND_LABELS = ['reserve' => 'Réserve', 'sav' => 'Demande SAV', 'garantie' => 'Garantie'];

    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly Presenter $present,
        private readonly SiteAccess $access,
        private readonly ActivityRecorder $activity,
    ) {}

    #[Route('/api/reserves', methods: ['GET'])]
    public function list(#[CurrentUser] User $user, Request $request, UserSites $userSites): JsonResponse
    {
        $memberships = [];
        if ($siteId = $request->query->get('siteId')) {
            $site = $this->access->site($siteId);
            $memberships[(string) $site->getId()] = $this->access->member($site, $user);
        } else {
            $memberships = $userSites->memberships($user, true);
        }
        $teamSites = [];
        $clientSites = [];
        foreach ($memberships as $m) {
            if ($m->seesTeamContent()) {
                $teamSites[] = $m->getSite();
            } else {
                $clientSites[] = $m->getSite();
            }
        }
        if (!$teamSites && !$clientSites) {
            return $this->json(['items' => []]);
        }
        $qb = $this->em->createQueryBuilder()->select('r', 's')->from(Reserve::class, 'r')->join('r.site', 's');
        $or = [];
        if ($teamSites) {
            $or[] = 'r.site IN (:team)';
            $qb->setParameter('team', $teamSites);
        }
        if ($clientSites) {
            $or[] = '(r.site IN (:cl) AND r.visibility = :vis)';
            $qb->setParameter('cl', $clientSites)->setParameter('vis', Document::VISIBILITY_CLIENT);
        }
        $qb->where(implode(' OR ', $or));
        $status = $request->query->get('status');
        if ($status === 'not_done') {
            $qb->andWhere('r.status != :done')->setParameter('done', Reserve::STATUS_DONE);
        } elseif (in_array($status, Reserve::STATUSES, true)) {
            $qb->andWhere('r.status = :st')->setParameter('st', $status);
        }
        if (in_array($kind = $request->query->get('kind'), Reserve::KINDS, true)) {
            $qb->andWhere('r.kind = :k')->setParameter('k', $kind);
        }
        $items = $qb->setMaxResults(500)->getQuery()->getResult();
        usort($items, [self::class, 'compare']);
        return $this->json(['items' => array_map(fn (Reserve $r) => $this->present->reserve($r), $items)]);
    }

    #[Route('/api/sites/{id}/reserves', methods: ['POST'])]
    public function create(#[CurrentUser] User $user, string $id, Request $request, Notifier $notifier, SiteMemberRepository $members): JsonResponse
    {
        $site = $this->access->site($id);
        $m = $this->access->member($site, $user);
        $in = Input::from($request);
        $kind = $in->oneOf('kind', Reserve::KINDS, 'reserve');
        if ($m->isClient() && $kind !== 'sav') {
            throw new AccessDeniedHttpException('Vous pouvez signaler une demande SAV ; les réserves sont saisies par l’équipe.');
        }
        $r = new Reserve($site, $kind, $in->required('title', 'Le titre', 200), $user);
        $r->setDescription($in->string('description', null, 4000));
        $r->setLocation($in->string('location', null, 160));
        if ($m->seesTeamContent()) {
            $r->setDueOn($in->day('dueOn'));
            $r->setVisibility($in->oneOf('visibility', [Document::VISIBILITY_TEAM, Document::VISIBILITY_CLIENT], Document::VISIBILITY_CLIENT));
            if ($in->has('assigneeId')) {
                $r->setAssignee($this->assignee($site, $in->uuid('assigneeId')));
            }
        }
        if ($in->has('photoIds')) {
            $r->setPhotoIds($this->photoIds($site, $in));
        }
        $this->em->persist($r);
        $this->em->persist(new ReserveEvent($r, $user, Reserve::STATUS_OPEN, $m->isClient() ? 'Demande envoyée par le client.' : 'Signalée.'));
        $this->activity->record(
            $site, ActivityEvent::RESERVE_OPENED, $user, $r->getTitle(),
            self::KIND_LABELS[$r->getKind()].($r->getLocation() ? ' · '.$r->getLocation() : '').'.',
            ['reserveId' => (string) $r->getId()], $r->getVisibility(),
        );
        if ($m->isClient()) {
            foreach ($members->forSite($site) as $sm) {
                if ($sm->isManager()) {
                    $notifier->notify($sm->getUser(), $site, 'reserve', $site->getName(), sprintf('Demande SAV de %s : %s', $user->getFullName(), $r->getTitle()), '/reserves/'.$r->getId());
                }
            }
        } elseif ($r->getAssignee() && $r->getAssignee() !== $user) {
            $notifier->notify($r->getAssignee(), $site, 'reserve', $site->getName(), sprintf('%s vous a confié : %s', $user->getFirstName(), $r->getTitle()), '/reserves/'.$r->getId());
        }
        $this->em->flush();
        $notifier->flushPush();
        return $this->json($this->present->reserve($r), 201);
    }

    #[Route('/api/reserves/{id}', methods: ['GET'])]
    public function show(#[CurrentUser] User $user, string $id): JsonResponse
    {
        [$r, $m] = $this->find($id, $user);
        return $this->json($this->detail($r, $m));
    }

    /** Avancement : statut, note, responsable, echeance. Chaque modification entre dans l'historique. */
    #[Route('/api/reserves/{id}', methods: ['PATCH'])]
    public function update(#[CurrentUser] User $user, string $id, Request $request): JsonResponse
    {
        [$r, $m] = $this->find($id, $user);
        if (!$m->seesTeamContent()) {
            throw new AccessDeniedHttpException("Le traitement est suivi par l'équipe.");
        }
        $in = Input::from($request);
        $statusChange = null;
        $notes = [];
        if ($in->has('title')) {
            $r->setTitle($in->required('title', 'Le titre', 200));
        }
        foreach (['description' => 4000, 'location' => 160] as $k => $max) {
            if ($in->has($k)) {
                $r->{'set'.ucfirst($k)}($in->string($k, null, $max));
            }
        }
        if ($in->has('kind')) {
            $r->setKind($in->oneOf('kind', Reserve::KINDS));
        }
        if ($in->has('dueOn')) {
            $r->setDueOn($in->day('dueOn'));
            $notes[] = $r->getDueOn() ? 'Échéance au '.DocumentController::frDate($r->getDueOn()).'.' : 'Échéance retirée.';
        }
        if ($in->has('visibility')) {
            $r->setVisibility($in->oneOf('visibility', [Document::VISIBILITY_TEAM, Document::VISIBILITY_CLIENT]));
        }
        if ($in->has('assigneeId')) {
            $a = $this->assignee($r->getSite(), $in->uuid('assigneeId'));
            if ($a !== $r->getAssignee()) {
                $r->setAssignee($a);
                $notes[] = $a ? 'Confiée à '.$a->getFullName().'.' : 'Plus de responsable désigné.';
            }
        }
        if ($in->has('photoIds')) {
            $r->setPhotoIds($this->photoIds($r->getSite(), $in));
        }
        if ($in->has('status')) {
            $status = $in->oneOf('status', Reserve::STATUSES);
            if ($status !== $r->getStatus()) {
                $r->setStatus($status);
                $statusChange = $status;
            }
        }
        $note = $in->string('note', null, 4000);
        if ($note) {
            array_unshift($notes, $note);
        }
        if ($statusChange || $notes) {
            $this->em->persist(new ReserveEvent($r, $user, $statusChange, $notes ? implode(' ', $notes) : null));
        }
        if ($statusChange) {
            $this->activity->record(
                $r->getSite(), ActivityEvent::RESERVE_UPDATED, $user,
                sprintf('%s : %s', self::STATUS_LABELS[$statusChange], $r->getTitle()), $note,
                ['reserveId' => (string) $r->getId()], $r->getVisibility(),
            );
        }
        $this->em->flush();
        return $this->json($this->detail($r, $m));
    }

    private function detail(Reserve $r, SiteMember $m): array
    {
        $history = $this->em->getRepository(ReserveEvent::class)->findBy(['reserve' => $r], ['at' => 'ASC']);
        return $this->present->reserveDetail($r, $history, !$m->seesTeamContent());
    }

    /** @return array{0: Reserve, 1: SiteMember} */
    private function find(string $id, User $user): array
    {
        $r = Uuid::isValid($id) ? $this->em->find(Reserve::class, Uuid::fromString($id)) : null;
        if (!$r) {
            throw new NotFoundHttpException('Réserve introuvable.');
        }
        $m = $this->access->member($r->getSite(), $user);
        if (!$m->seesTeamContent() && !$r->isVisibleToClient()) {
            throw new NotFoundHttpException('Réserve introuvable.');
        }
        return [$r, $m];
    }

    private function assignee(Site $site, ?Uuid $id): ?User
    {
        if (!$id) {
            return null;
        }
        $u = $this->em->find(User::class, $id);
        $member = $u ? $this->em->getRepository(SiteMember::class)->findOneBy(['site' => $site, 'user' => $u]) : null;
        if (!$u || $u->isClient() || (!$member && !$u->isAdmin())) {
            throw ApiProblem::validation(['assigneeId' => 'Cette personne ne fait pas partie de l’équipe du chantier.']);
        }
        return $u;
    }

    /** @return list<string> */
    private function photoIds(Site $site, Input $in): array
    {
        $out = [];
        foreach ($in->uuids('photoIds') as $id) {
            $p = $this->em->find(Photo::class, $id);
            if (!$p || $p->getSite() !== $site) {
                throw ApiProblem::validation(['photoIds' => 'Photo introuvable sur ce chantier.']);
            }
            $out[] = $id->toRfc4122();
        }
        return $out;
    }

    /** Non levees d'abord ; en retard, puis par echeance, puis les plus recentes. */
    public static function compare(Reserve $a, Reserve $b): int
    {
        if ($a->isDone() !== $b->isDone()) {
            return $a->isDone() ? 1 : -1;
        }
        if ($a->isDone()) {
            return $b->getDoneAt() <=> $a->getDoneAt();
        }
        $da = $a->getDueOn()?->getTimestamp() ?? PHP_INT_MAX;
        $db = $b->getDueOn()?->getTimestamp() ?? PHP_INT_MAX;
        return $da !== $db ? $da <=> $db : $b->getReportedAt() <=> $a->getReportedAt();
    }
}
