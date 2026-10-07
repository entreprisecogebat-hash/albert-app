<?php

namespace App\Controller\Admin;

use App\Api\ApiProblem;
use App\Api\Input;
use App\Api\Presenter;
use App\Entity\ActivityEvent;
use App\Entity\Document;
use App\Entity\Folder;
use App\Entity\Message;
use App\Entity\Photo;
use App\Entity\Site;
use App\Entity\SiteMember;
use App\Entity\User;
use App\Repository\ActivityEventRepository;
use App\Repository\SiteMemberRepository;
use App\Repository\SiteRepository;
use App\Service\ActivityRecorder;
use App\Service\SiteAccess;
use App\Service\SiteFactory;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;
use Symfony\Component\Uid\Uuid;

/** Back-office : creation et suivi des chantiers, droits, supervision, exports. */
#[Route('/api/admin/sites')]
final class AdminSiteController extends AbstractController
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly Presenter $present,
        private readonly SiteAccess $access,
    ) {}

    #[Route('', methods: ['GET'])]
    public function list(Request $request, SiteRepository $sites): JsonResponse
    {
        $items = [];
        foreach ($sites->adminSearch($request->query->get('q'), $request->query->get('status')) as $s) {
            $items[] = $this->present->site($s) + $this->stats($s);
        }
        return $this->json(['items' => $items]);
    }

    #[Route('', methods: ['POST'])]
    public function create(#[CurrentUser] User $admin, Request $request, SiteFactory $factory): JsonResponse
    {
        $in = Input::from($request);
        $site = $factory->create(
            $admin,
            $in->required('name', 'Le nom du chantier', 160),
            $in->required('address', "L'adresse", 255),
            ['reference' => $in->string('reference', null, 40), 'clientName' => $in->string('clientName', null, 160), 'startedOn' => $in->string('startedOn')],
        );
        $this->em->flush();
        return $this->json($this->present->site($site) + $this->stats($site), 201);
    }

    #[Route('/{id}', methods: ['GET'])]
    public function show(string $id, SiteMemberRepository $members): JsonResponse
    {
        $site = $this->access->site($id);
        return $this->json($this->present->site($site) + $this->stats($site) + [
            'members' => array_map(fn (SiteMember $m) => ['id' => (string) $m->getId(), 'role' => $m->getRole(), 'addedAt' => Presenter::date($m->getAddedAt()), 'lastSeenAt' => Presenter::date($m->getLastSeenAt()), 'user' => $this->present->user($m->getUser())], $members->forSite($site)),
            'folders' => array_map(fn (Folder $f) => $this->present->folder($f), $this->em->getRepository(Folder::class)->findBy(['site' => $site], ['position' => 'ASC'])),
        ]);
    }

    #[Route('/{id}', methods: ['PATCH'])]
    public function update(string $id, Request $request): JsonResponse
    {
        $site = $this->access->site($id);
        $in = Input::from($request);
        if ($in->has('name')) {
            $site->setName($in->required('name', 'Le nom du chantier', 160));
        }
        if ($in->has('address')) {
            $site->setAddress($in->required('address', "L'adresse", 255));
        }
        if ($in->has('reference')) {
            $site->setReference($in->string('reference', null, 40));
        }
        if ($in->has('clientName')) {
            $site->setClientName($in->string('clientName', null, 160));
        }
        if ($in->has('startedOn')) {
            $site->setStartedOn($in->date('startedOn'));
        }
        if ($in->has('status')) {
            $site->setStatus($in->oneOf('status', [Site::STATUS_ACTIVE, Site::STATUS_ARCHIVED]));
        }
        $this->em->flush();
        return $this->json($this->present->site($site) + $this->stats($site));
    }

    #[Route('/{id}/members', methods: ['POST'])]
    public function addMember(#[CurrentUser] User $admin, string $id, Request $request, SiteMemberRepository $members, ActivityRecorder $activity): JsonResponse
    {
        $site = $this->access->site($id);
        $in = Input::from($request);
        $userId = $in->uuid('userId');
        $user = $userId ? $this->em->find(User::class, $userId) : null;
        if (!$user) {
            throw ApiProblem::validation(['userId' => 'Choisissez un intervenant.']);
        }
        $role = $in->oneOf('role', SiteMember::ROLES, $user->isClient() ? SiteMember::ROLE_CLIENT : SiteMember::ROLE_WORKER);
        if ($user->isClient() && $role !== SiteMember::ROLE_CLIENT) {
            throw ApiProblem::validation(['role' => 'Un compte client ne peut avoir que le rôle client.']);
        }
        $m = $members->findMembership($site, $user);
        if ($m) {
            $m->setRole($role);
        } else {
            $m = new SiteMember($site, $user, $role);
            $this->em->persist($m);
            $activity->record(
                $site, ActivityEvent::MEMBER_ADDED, $admin,
                sprintf('%s a rejoint le chantier', $user->getFullName()),
                self::roleLabel($role), ['userId' => (string) $user->getId()], Document::VISIBILITY_TEAM,
            );
        }
        $this->em->flush();
        return $this->json(['id' => (string) $m->getId(), 'role' => $m->getRole(), 'user' => $this->present->user($user)], 201);
    }

    #[Route('/{id}/members/{memberId}', methods: ['DELETE'])]
    public function removeMember(string $id, string $memberId): JsonResponse
    {
        $site = $this->access->site($id);
        $m = Uuid::isValid($memberId) ? $this->em->find(SiteMember::class, Uuid::fromString($memberId)) : null;
        if (!$m || $m->getSite() !== $site) {
            throw new NotFoundHttpException('Membre introuvable.');
        }
        $this->em->remove($m);
        $this->em->flush();
        return $this->json(['ok' => true]);
    }

    /** Ajout d'un dossier sur un chantier en cours (l'arborescence type reste inchangee). */
    #[Route('/{id}/folders', methods: ['POST'])]
    public function addFolder(string $id, Request $request): JsonResponse
    {
        $site = $this->access->site($id);
        $in = Input::from($request);
        $count = count($this->em->getRepository(Folder::class)->findBy(['site' => $site]));
        $f = new Folder($site, $in->required('name', 'Le nom du dossier', 120), $in->string('kind', 'custom', 30), $count);
        $this->em->persist($f);
        $this->em->flush();
        return $this->json($this->present->folder($f), 201);
    }

    /** Supervision : fil complet du chantier, y compris le canal interne. */
    #[Route('/{id}/activity', methods: ['GET'])]
    public function activity(string $id, Request $request, ActivityEventRepository $events): JsonResponse
    {
        $site = $this->access->site($id);
        $before = Input::queryDate($request, 'before');
        $list = $events->feed($site, false, $request->query->get('filter') ?: null, $before, 100);
        return $this->json(['items' => $this->present->feed($list)]);
    }

    /** Export CSV du journal du chantier : la preuve, horodatee, dans l'ordre. */
    #[Route('/{id}/export.csv', methods: ['GET'])]
    public function export(string $id, ActivityEventRepository $events): StreamedResponse
    {
        $site = $this->access->site($id);
        $list = array_reverse($events->feed($site, false, null, null, 10000));
        $resp = new StreamedResponse(function () use ($list) {
            $out = fopen('php://output', 'w');
            fwrite($out, "\xEF\xBB\xBF"); // BOM pour Excel
            fputcsv($out, ['Date', 'Heure', 'Type', 'Auteur', 'Titre', 'Détail', 'Visibilité', 'Reçu par le serveur'], ';');
            foreach ($list as $e) {
                fputcsv($out, [
                    $e->getOccurredAt()->format('d/m/Y'),
                    $e->getOccurredAt()->format('H:i:s'),
                    self::typeLabel($e->getType()),
                    $e->getActor()?->getFullName() ?? '',
                    $e->getTitle(),
                    $e->getSubtitle() ?? '',
                    $e->getVisibility() === Document::VISIBILITY_CLIENT ? 'Équipe et client' : 'Équipe',
                    $e->getRecordedAt()->format('d/m/Y H:i:s'),
                ], ';');
            }
            fclose($out);
        });
        $name = sprintf('albert-%s-%s.csv', preg_replace('/[^a-z0-9]+/', '-', strtolower(\App\Classification\TitleNormalizer::stripAccents($site->getName()))), date('Ymd'));
        $resp->headers->set('Content-Type', 'text/csv; charset=utf-8');
        $resp->headers->set('Content-Disposition', 'attachment; filename="'.$name.'"');
        return $resp;
    }

    private function stats(Site $s): array
    {
        $count = fn (string $class, string $field = 'site') => (int) $this->em->createQueryBuilder()
            ->select('COUNT(x.id)')->from($class, 'x')->where("x.$field = :s")->setParameter('s', $s)
            ->getQuery()->getSingleScalarResult();
        $messages = (int) $this->em->createQueryBuilder()->select('COUNT(m.id)')->from(Message::class, 'm')
            ->join('m.channel', 'c')->where('c.site = :s')->setParameter('s', $s)->getQuery()->getSingleScalarResult();
        $week = (int) $this->em->createQueryBuilder()->select('COUNT(e.id)')->from(ActivityEvent::class, 'e')
            ->where('e.site = :s')->andWhere('e.recordedAt > :w')->setParameter('s', $s)
            ->setParameter('w', new \DateTimeImmutable('-7 days'))->getQuery()->getSingleScalarResult();

        return ['stats' => [
            'members' => $count(SiteMember::class),
            'documents' => $count(Document::class),
            'photos' => $count(Photo::class),
            'messages' => $messages,
            'eventsLast7Days' => $week,
        ]];
    }

    public static function roleLabel(string $role): string
    {
        return match ($role) {
            SiteMember::ROLE_MANAGER => 'Responsable du chantier',
            SiteMember::ROLE_CLIENT => 'Client',
            default => 'Équipe',
        };
    }

    private static function typeLabel(string $type): string
    {
        return match ($type) {
            ActivityEvent::PHOTOS_ADDED => 'Photos',
            ActivityEvent::DOCUMENT_ADDED => 'Document',
            ActivityEvent::DOCUMENT_VERSION => 'Nouvelle version',
            ActivityEvent::DOCUMENT_RECLASSIFIED => 'Classement corrigé',
            ActivityEvent::MESSAGE => 'Message',
            ActivityEvent::MEMBER_ADDED => 'Équipe',
            ActivityEvent::SITE_CREATED => 'Chantier',
            default => 'Événement',
        };
    }
}
