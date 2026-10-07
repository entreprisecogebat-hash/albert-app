<?php

namespace App\Controller;

use App\Api\ApiProblem;
use App\Api\Input;
use App\Api\Presenter;
use App\Entity\ActivityEvent;
use App\Entity\Appointment;
use App\Entity\Contact;
use App\Entity\Document;
use App\Entity\User;
use App\Service\ActivityRecorder;
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
 * Agenda partage de l'entreprise (F-01 RDV, F-03).
 * L'equipe voit les RDV de ses chantiers et ceux qui ne sont lies a aucun chantier (prospection) ;
 * le client voit les RDV de ses chantiers, sans la fiche CRM ni les notes internes.
 */
final class AppointmentController extends AbstractController
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly Presenter $present,
        private readonly SiteAccess $access,
        private readonly UserSites $userSites,
    ) {}

    #[Route('/api/appointments', methods: ['GET'])]
    public function list(#[CurrentUser] User $user, Request $request): JsonResponse
    {
        $from = Input::queryDate($request, 'from') ?? new \DateTimeImmutable('today');
        $to = Input::queryDate($request, 'to') ?? $from->modify('+60 days');
        $sites = $this->userSites->sites($user, true);

        $qb = $this->em->createQueryBuilder()->select('a', 's', 'c')->from(Appointment::class, 'a')
            ->leftJoin('a.site', 's')->leftJoin('a.contact', 'c')
            ->where('a.company = :co')->setParameter('co', $user->getCompany())
            ->andWhere('a.startsAt >= :from')->andWhere('a.startsAt < :to')
            ->setParameter('from', $from)->setParameter('to', $to)
            ->orderBy('a.startsAt', 'ASC')
            ->setMaxResults(500);

        if ($user->isClient()) {
            if (!$sites) {
                return $this->json(['items' => []]);
            }
            $qb->andWhere('a.site IN (:sites)')->setParameter('sites', $sites);
        } elseif ($sites) {
            $qb->andWhere('a.site IS NULL OR a.site IN (:sites)')->setParameter('sites', $sites);
        } else {
            $qb->andWhere('a.site IS NULL');
        }
        if ($siteId = $request->query->get('siteId')) {
            $site = $this->access->site($siteId);
            $this->access->member($site, $user);
            $qb->andWhere('a.site = :one')->setParameter('one', $site);
        }
        if ($contactId = $request->query->get('contactId')) {
            if ($user->isClient() || !Uuid::isValid($contactId)) {
                return $this->json(['items' => []]);
            }
            $qb->andWhere('a.contact = :ct')->setParameter('ct', Uuid::fromString($contactId), 'uuid');
        }
        $forTeam = !$user->isClient();
        return $this->json(['items' => array_map(fn (Appointment $a) => $this->present->appointment($a, $forTeam), $qb->getQuery()->getResult())]);
    }

    #[Route('/api/appointments', methods: ['POST'])]
    public function create(#[CurrentUser] User $user, Request $request, ActivityRecorder $activity): JsonResponse
    {
        $this->requireTeam($user);
        $in = Input::from($request);
        $startsAt = $in->date('startsAt') ?? throw ApiProblem::validation(['startsAt' => 'La date du rendez-vous est obligatoire.']);
        $a = new Appointment($user->getCompany(), $in->required('title', 'Le titre', 200), $startsAt, $user);
        $this->apply($a, $in, $user);
        $this->em->persist($a);
        if ($a->getSite()) {
            $activity->record(
                $a->getSite(), ActivityEvent::APPOINTMENT, $user, 'RDV : '.$a->getTitle(),
                ucfirst(self::when($a->getStartsAt())).($a->getLocation() ? ' · '.$a->getLocation() : '').'.',
                ['appointmentId' => (string) $a->getId()], Document::VISIBILITY_TEAM,
            );
        }
        $this->em->flush();
        return $this->json($this->present->appointment($a), 201);
    }

    #[Route('/api/appointments/{id}', methods: ['PATCH'])]
    public function update(#[CurrentUser] User $user, string $id, Request $request): JsonResponse
    {
        $this->requireTeam($user);
        $a = $this->find($id, $user);
        $in = Input::from($request);
        if ($in->has('title')) {
            $a->setTitle($in->required('title', 'Le titre', 200));
        }
        if ($in->has('startsAt')) {
            $a->setStartsAt($in->date('startsAt') ?? throw ApiProblem::validation(['startsAt' => 'La date du rendez-vous est obligatoire.']));
        }
        $this->apply($a, $in, $user);
        $this->em->flush();
        return $this->json($this->present->appointment($a));
    }

    #[Route('/api/appointments/{id}', methods: ['DELETE'])]
    public function delete(#[CurrentUser] User $user, string $id): JsonResponse
    {
        $this->requireTeam($user);
        $this->em->remove($this->find($id, $user));
        $this->em->flush();
        return $this->json(['ok' => true]);
    }

    private function apply(Appointment $a, Input $in, User $user): void
    {
        if ($in->has('endsAt')) {
            $end = $in->date('endsAt');
            if ($end && $end < $a->getStartsAt()) {
                throw ApiProblem::validation(['endsAt' => 'La fin doit être après le début.']);
            }
            $a->setEndsAt($end);
        }
        if ($in->has('location')) {
            $a->setLocation($in->string('location', null, 255));
        }
        if ($in->has('notes')) {
            $a->setNotes($in->string('notes', null, 4000));
        }
        if ($in->has('siteId')) {
            $sid = $in->string('siteId');
            if ($sid === null) {
                $a->setSite(null);
            } else {
                $site = $this->access->site($sid);
                $this->access->requireStaff($this->access->member($site, $user));
                $a->setSite($site);
            }
        }
        if ($in->has('contactId')) {
            $cid = $in->uuid('contactId');
            $contact = $cid ? $this->em->find(Contact::class, $cid) : null;
            if ($cid && (!$contact || $contact->getCompany() !== $user->getCompany())) {
                throw ApiProblem::validation(['contactId' => 'Contact introuvable.']);
            }
            $a->setContact($contact);
            if (!$a->getLocation() && $contact?->getAddress() && !$a->getSite()) {
                $a->setLocation($contact->getAddress());
            }
        }
        if (!$a->getLocation() && $a->getSite()) {
            $a->setLocation($a->getSite()->getAddress());
        }
    }

    private function find(string $id, User $user): Appointment
    {
        $a = Uuid::isValid($id) ? $this->em->find(Appointment::class, Uuid::fromString($id)) : null;
        if (!$a || $a->getCompany() !== $user->getCompany()) {
            throw new NotFoundHttpException('Rendez-vous introuvable.');
        }
        if ($a->getSite()) {
            $this->access->member($a->getSite(), $user);
        }
        return $a;
    }

    private function requireTeam(User $user): void
    {
        if ($user->isClient()) {
            throw new AccessDeniedHttpException("L'agenda est géré par l'équipe.");
        }
    }

    /** "mardi 7 octobre a 9:30" */
    public static function when(\DateTimeImmutable $d): string
    {
        static $days = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
        return $days[(int) $d->format('w')].' '.DocumentController::frDate($d).' à '.$d->format('G:i');
    }
}
