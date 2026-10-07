<?php

namespace App\Controller;

use App\Api\Input;
use App\Api\Presenter;
use App\Entity\ActivityEvent;
use App\Entity\Document;
use App\Entity\Site;
use App\Entity\TimeEntry;
use App\Entity\User;
use App\Service\ActivityRecorder;
use App\Service\ClockStateBuilder;
use App\Service\InterventionService;
use App\Service\SiteAccess;
use App\Api\ApiProblem;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

/**
 * Pointage virtuel (F-10, F-11). Arrivee et depart, avec la position du telephone si elle est donnee.
 * Pas de suivi en continu : seule la position au moment du pointage est enregistree (RGPD).
 */
final class ClockController extends AbstractController
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly Presenter $present,
        private readonly SiteAccess $access,
        private readonly ActivityRecorder $activity,
        private readonly ClockStateBuilder $clock,
    ) {}

    #[Route('/api/clock', methods: ['GET'])]
    public function state(#[CurrentUser] User $user): JsonResponse
    {
        return $this->json($this->clock->state($user));
    }

    #[Route('/api/sites/{id}/clock/in', methods: ['POST'])]
    public function in(#[CurrentUser] User $user, string $id, Request $request): JsonResponse
    {
        $site = $this->access->site($id);
        $this->access->requireStaff($this->access->member($site, $user));
        $in = Input::from($request);
        $clientId = $in->uuid('clientId');
        if ($clientId && ($done = $this->em->getRepository(TimeEntry::class)->findOneBy(['clientId' => $clientId]))) {
            return $this->json($this->present->timeEntry($done));
        }
        $at = self::credible($in->date('at'));

        // Un seul pointage ouvert : arriver ailleurs ferme le precedent.
        $open = $this->clock->openEntry($user);
        if ($open) {
            if ($open->getSite() === $site) {
                return $this->json($this->present->timeEntry($open));
            }
            $open->close($at);
            $this->activity->record($open->getSite(), ActivityEvent::CLOCK_OUT, $user, $user->getFirstName().' a quitté le chantier',
                InterventionService::duration($open->minutes()).' sur place.', [], Document::VISIBILITY_TEAM, $at);
        }

        $entry = new TimeEntry($site, $user, $at, $clientId);
        $lat = $in->float('latitude');
        $lng = $in->float('longitude');
        $entry->setStart($lat, $lng, $in->float('accuracy'), self::distance($site, $lat, $lng));
        $entry->setNote($in->string('note', null, 500));
        $this->em->persist($entry);

        $d = $entry->getStartDistance();
        $this->activity->record(
            $site, ActivityEvent::CLOCK_IN, $user, $user->getFirstName().' est arrivé sur le chantier',
            $d === null ? 'Position non transmise.' : ($d <= 300 ? 'Sur place.' : sprintf('À %s du chantier.', self::meters($d))),
            [], Document::VISIBILITY_TEAM, $at,
        );
        $this->em->flush();
        return $this->json($this->present->timeEntry($entry), 201);
    }

    #[Route('/api/clock/out', methods: ['POST'])]
    public function out(#[CurrentUser] User $user, Request $request): JsonResponse
    {
        if ($user->isClient()) {
            throw new AccessDeniedHttpException("Cette action est réservée à l'équipe.");
        }
        $in = Input::from($request);
        $clientId = $in->uuid('clientId');
        if ($clientId && ($done = $this->em->getRepository(TimeEntry::class)->findOneBy(['endClientId' => $clientId]))) {
            return $this->json($this->present->timeEntry($done));
        }
        $open = $this->clock->openEntry($user);
        if (!$open) {
            throw new ApiProblem('Aucun pointage en cours.', 409, 'not_clocked_in');
        }
        $at = self::credible($in->date('at'));
        $open->close($at, $in->float('latitude'), $in->float('longitude'), $clientId);
        if ($in->has('note')) {
            $open->setNote($in->string('note', null, 500));
        }
        $this->activity->record(
            $open->getSite(), ActivityEvent::CLOCK_OUT, $user, $user->getFirstName().' a quitté le chantier',
            InterventionService::duration($open->minutes()).' sur place.', [], Document::VISIBILITY_TEAM, $open->getEndedAt(),
        );
        $this->em->flush();
        return $this->json($this->present->timeEntry($open));
    }

    /** Responsable : toute l'equipe ; compagnon : ses propres pointages. Depuis lundi par defaut. */
    #[Route('/api/sites/{id}/time-entries', methods: ['GET'])]
    public function entries(#[CurrentUser] User $user, string $id, Request $request): JsonResponse
    {
        $site = $this->access->site($id);
        $m = $this->access->member($site, $user);
        $this->access->requireStaff($m);
        $from = Input::queryDate($request, 'from') ?? new \DateTimeImmutable('monday this week');
        $qb = $this->em->createQueryBuilder()->select('e', 'u')->from(TimeEntry::class, 'e')->join('e.user', 'u')
            ->where('e.site = :s')->andWhere('e.startedAt >= :from')
            ->setParameter('s', $site)->setParameter('from', $from)
            ->orderBy('e.startedAt', 'DESC')->setMaxResults(500);
        if (!$m->isManager()) {
            $qb->andWhere('e.user = :me')->setParameter('me', $user);
        }
        $items = $qb->getQuery()->getResult();
        $now = new \DateTimeImmutable();
        return $this->json([
            'items' => array_map(fn (TimeEntry $e) => $this->present->timeEntry($e), $items),
            'totalMinutes' => array_sum(array_map(fn (TimeEntry $e) => $e->minutes($now), $items)),
        ]);
    }

    /** Heure du telephone (pointage hors ligne) si elle est credible, sinon heure du serveur. */
    private static function credible(?\DateTimeImmutable $at): \DateTimeImmutable
    {
        $now = new \DateTimeImmutable();
        return ($at && $at <= $now && $at > $now->modify('-2 days')) ? $at : $now;
    }

    /** Distance (haversine) entre la position du pointage et le chantier, en metres. */
    public static function distance(Site $site, ?float $lat, ?float $lng): ?int
    {
        if ($lat === null || $lng === null || $site->getLatitude() === null || $site->getLongitude() === null) {
            return null;
        }
        $r = 6371000.0;
        $p1 = deg2rad($lat);
        $p2 = deg2rad($site->getLatitude());
        $dp = $p2 - $p1;
        $dl = deg2rad($site->getLongitude() - $lng);
        $a = sin($dp / 2) ** 2 + cos($p1) * cos($p2) * sin($dl / 2) ** 2;
        return (int) round(2 * $r * asin(min(1, sqrt($a))));
    }

    private static function meters(int $d): string
    {
        return $d >= 1000 ? str_replace('.', ',', (string) round($d / 1000, 1)).' km' : $d.' m';
    }
}
