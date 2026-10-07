<?php

namespace App\Controller;

use App\Api\ApiProblem;
use App\Api\Input;
use App\Api\Presenter;
use App\Entity\ActivityEvent;
use App\Entity\Appointment;
use App\Entity\Channel;
use App\Entity\Document;
use App\Entity\FinanceEntry;
use App\Entity\Folder;
use App\Entity\Intervention;
use App\Entity\Photo;
use App\Entity\Reserve;
use App\Entity\Site;
use App\Entity\SiteMember;
use App\Entity\Task;
use App\Entity\User;
use App\Service\ActivityRecorder;
use App\Repository\ActivityEventRepository;
use App\Repository\SiteMemberRepository;
use App\Repository\SiteRepository;
use App\Service\FinanceService;
use App\Service\SiteAccess;
use App\Service\SiteFactory;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

#[Route('/api/sites')]
final class SiteController extends AbstractController
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly Presenter $present,
        private readonly SiteAccess $access,
        private readonly ActivityEventRepository $events,
    ) {}

    /** "Mes chantiers" (F-01) */
    #[Route('', methods: ['GET'])]
    public function list(#[CurrentUser] User $user, Request $request, SiteRepository $sites): JsonResponse
    {
        $memberships = $sites->findForMember($user, $request->query->get('q'), $request->query->getBoolean('archived'));
        $channels = $this->clientChannelsBySite();
        $out = [];
        foreach ($memberships as $m) {
            $site = $m->getSite();
            $clientOnly = !$m->seesTeamContent();
            $since = $m->getLastSeenAt() ?? $m->getAddedAt();
            $out[] = $this->present->siteCard(
                $m,
                $this->events->latest($site, $clientOnly, FinanceService::hiddenFeedTypes($m)),
                $this->events->countSince($site, $since, $clientOnly, (string) $user->getId(), FinanceService::hiddenFeedTypes($m)),
                !$clientOnly && ($channels[(string) $site->getId()] ?? false),
            );
        }
        return $this->json(['items' => $out]);
    }

    #[Route('', methods: ['POST'])]
    public function create(#[CurrentUser] User $user, Request $request, SiteFactory $factory): JsonResponse
    {
        if ($user->isClient()) {
            throw new AccessDeniedHttpException("La création d'un chantier est réservée à l'équipe.");
        }
        $in = Input::from($request);
        $site = $factory->create(
            $user,
            $in->required('name', 'Le nom du chantier', 160),
            $in->required('address', "L'adresse", 255),
            ['reference' => $in->string('reference', null, 40), 'clientName' => $in->string('clientName', null, 160), 'startedOn' => $in->string('startedOn')],
        );
        $this->em->flush();
        return $this->json($this->detail($site, $user), 201);
    }

    #[Route('/{id}', methods: ['GET'])]
    public function show(#[CurrentUser] User $user, string $id): JsonResponse
    {
        return $this->json($this->detail($this->access->site($id), $user));
    }

    /**
     * Phase, archivage (F-14) et date de reception. Reserve aux responsables du chantier.
     * Chaque changement est trace dans le fil, visible du client.
     */
    #[Route('/{id}', methods: ['PATCH'])]
    public function update(#[CurrentUser] User $user, string $id, Request $request, ActivityRecorder $activity): JsonResponse
    {
        $site = $this->access->site($id);
        $this->access->requireManager($this->access->member($site, $user));
        $in = Input::from($request);
        static $phaseLabels = ['avant' => 'Avant chantier', 'pendant' => 'En cours', 'apres' => 'Après chantier'];

        if ($in->has('deliveredOn')) {
            $d = $in->string('deliveredOn');
            if ($d !== null && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $d)) {
                throw ApiProblem::validation(['deliveredOn' => 'Date invalide (AAAA-MM-JJ).']);
            }
            $site->setDeliveredOn($d ? new \DateTimeImmutable($d) : null);
        }
        if ($in->has('phase')) {
            $phase = $in->oneOf('phase', Site::PHASES);
            if ($phase !== $site->getPhase()) {
                $site->setPhase($phase);
                $subtitle = null;
                if ($phase === Site::PHASE_AFTER && !$site->getDeliveredOn()) {
                    $site->setDeliveredOn(new \DateTimeImmutable('today'));
                }
                if ($phase === Site::PHASE_AFTER) {
                    $subtitle = 'Réception le '.\App\Controller\DocumentController::frDate($site->getDeliveredOn()).'. Les garanties courent à partir de cette date.';
                }
                $activity->record($site, ActivityEvent::PHASE_CHANGED, $user, 'Chantier passé en « '.$phaseLabels[$phase].' »', $subtitle, ['phase' => $phase], Document::VISIBILITY_CLIENT);
            }
        }
        if ($in->has('status')) {
            $status = $in->oneOf('status', [Site::STATUS_ACTIVE, Site::STATUS_ARCHIVED]);
            if ($status !== $site->getStatus()) {
                $site->setStatus($status);
                $activity->record(
                    $site, ActivityEvent::PHASE_CHANGED, $user,
                    $status === Site::STATUS_ARCHIVED ? 'Chantier archivé' : 'Chantier réouvert',
                    $status === Site::STATUS_ARCHIVED ? 'Le dossier reste consultable et transmissible.' : null,
                    ['status' => $status], Document::VISIBILITY_CLIENT,
                );
            }
        }
        $this->em->flush();
        return $this->json($this->detail($site, $user));
    }

    /** Ouverture de la fiche chantier : les nouveautes sont vues. */
    #[Route('/{id}/seen', methods: ['POST'])]
    public function seen(#[CurrentUser] User $user, string $id, SiteMemberRepository $members): JsonResponse
    {
        $site = $this->access->site($id);
        $this->access->member($site, $user);
        $m = $members->findMembership($site, $user);
        if ($m) {
            $m->markSeen();
            $this->em->flush();
        }
        return $this->json(['ok' => true]);
    }

    /** Le fil unique du chantier (F-08), du plus recent au plus ancien. */
    #[Route('/{id}/feed', methods: ['GET'])]
    public function feed(#[CurrentUser] User $user, string $id, Request $request): JsonResponse
    {
        $site = $this->access->site($id);
        $m = $this->access->member($site, $user);
        $filter = $request->query->get('filter');
        if ($filter && !isset(ActivityEventRepository::FILTERS[$filter]) && $filter !== 'all') {
            throw ApiProblem::validation(['filter' => 'Filtre inconnu.']);
        }
        $before = Input::queryDate($request, 'before');
        $limit = min(100, max(1, $request->query->getInt('limit', 30)));
        $events = $this->events->feed($site, !$m->seesTeamContent(), $filter === 'all' ? null : $filter, $before, $limit + 1, FinanceService::hiddenFeedTypes($m));
        $hasMore = count($events) > $limit;
        $events = array_slice($events, 0, $limit);

        return $this->json([
            'items' => $this->present->feed($events),
            'nextBefore' => $hasMore && $events ? Presenter::date(end($events)->getOccurredAt()) : null,
        ]);
    }

    /** Arborescence du chantier (F-02) avec le nombre de documents par dossier. */
    #[Route('/{id}/folders', methods: ['GET'])]
    public function folders(#[CurrentUser] User $user, string $id): JsonResponse
    {
        $site = $this->access->site($id);
        $m = $this->access->member($site, $user);
        return $this->json(['items' => $this->foldersWithCounts($site, !$m->seesTeamContent())]);
    }

    #[Route('/{id}/members', methods: ['GET'])]
    public function members(#[CurrentUser] User $user, string $id, SiteMemberRepository $members): JsonResponse
    {
        $site = $this->access->site($id);
        $me = $this->access->member($site, $user);
        $items = [];
        foreach ($members->forSite($site) as $m) {
            // Le client voit l'equipe ; l'equipe voit tout le monde.
            if ($me->isClient() && $m->isClient() && $m->getUser() !== $user) {
                continue;
            }
            $items[] = ['role' => $m->getRole(), 'user' => $this->present->user($m->getUser(), !$me->isClient())];
        }
        return $this->json(['items' => $items]);
    }

    private function detail(Site $site, User $user): array
    {
        $m = $this->access->member($site, $user);
        $channels = $this->em->getRepository(Channel::class)->findBy(['site' => $site]);
        $channels = array_values(array_filter($channels, fn (Channel $c) => $m->seesTeamContent() || $c->isClient()));
        usort($channels, fn ($a, $b) => strcmp($b->getKind(), $a->getKind())); // internal avant client

        return $this->present->site($site) + [
            'role' => $m->getRole(),
            'canManage' => $m->isManager(),
            'channels' => array_map(fn (Channel $c) => $this->present->channel($c), $channels),
            'folders' => $this->foldersWithCounts($site, !$m->seesTeamContent()),
            'counts' => $this->counts($site, $m),
            'canSeeFinances' => FinanceService::canManage($m),
            'latitude' => $site->getLatitude(),
            'longitude' => $site->getLongitude(),
        ];
    }

    /** Compteurs des modules ; le client ne compte que ce qui lui est partage. */
    private function counts(Site $site, SiteMember $m): array
    {
        $client = !$m->seesTeamContent();
        $count = function (string $class, array $where) use ($site): int {
            $qb = $this->em->createQueryBuilder()->select('COUNT(x.id)')->from($class, 'x')
                ->where('x.site = :s')->setParameter('s', $site);
            foreach ($where as $i => [$expr, $value]) {
                $qb->andWhere(str_replace('?', ':p'.$i, $expr));
                if ($value !== null) {
                    $qb->setParameter('p'.$i, $value);
                }
            }
            return (int) $qb->getQuery()->getSingleScalarResult();
        };
        $vis = $client ? [['x.visibility = ?', Document::VISIBILITY_CLIENT]] : [];
        return [
            'documents' => $count(Document::class, $vis),
            'photos' => $count(Photo::class, $vis),
            'tasksOpen' => $client ? 0 : $count(Task::class, [['x.status = ?', Task::STATUS_TODO]]),
            'reservesOpen' => $count(Reserve::class, array_merge($vis, [['x.status != ?', Reserve::STATUS_DONE]])),
            'interventions' => $count(Intervention::class, $client ? [['x.status = ?', Intervention::STATUS_SIGNED]] : []),
            'appointmentsUpcoming' => $count(Appointment::class, [['x.startsAt >= ?', new \DateTimeImmutable('today')]]),
            'members' => $count(SiteMember::class, []),
            'financesOpen' => $this->financesOpen($site, $m),
        ];
    }

    /** Pieces non soldees : devis en cours, factures a encaisser, depenses a payer. Null sans acces aux finances. */
    private function financesOpen(Site $site, SiteMember $m): ?int
    {
        $mode = FinanceService::mode($m);
        if ($mode === null) {
            return null;
        }
        $entries = $this->em->getRepository(FinanceEntry::class)->findBy(['site' => $site]);
        return count(array_filter($entries, fn (FinanceEntry $f) => $f->isOpen()
            && ($mode === FinanceService::MODE_MANAGE || FinanceService::clientSees($f))));
    }

    private function foldersWithCounts(\App\Entity\Site $site, bool $clientOnly): array
    {
        $folders = $this->em->getRepository(Folder::class)->findBy(['site' => $site], ['position' => 'ASC']);
        $qb = $this->em->createQueryBuilder()
            ->select('IDENTITY(d.folder) AS fid, COUNT(d.id) AS n')
            ->from(Document::class, 'd')
            ->where('d.site = :s')->setParameter('s', $site)
            ->groupBy('d.folder');
        if ($clientOnly) {
            $qb->andWhere('d.visibility = :v')->setParameter('v', Document::VISIBILITY_CLIENT);
        }
        $counts = [];
        foreach ($qb->getQuery()->getArrayResult() as $row) {
            $counts[(string) $row['fid']] = (int) $row['n'];
        }
        return array_map(fn (Folder $f) => $this->present->folder($f, $counts[(string) $f->getId()] ?? 0), $folders);
    }

    /** @return array<string, bool> siteId => le client attend une reponse */
    private function clientChannelsBySite(): array
    {
        $out = [];
        foreach ($this->em->getRepository(Channel::class)->findBy(['kind' => Channel::KIND_CLIENT, 'awaitingReply' => true]) as $c) {
            $out[(string) $c->getSite()->getId()] = true;
        }
        return $out;
    }
}
