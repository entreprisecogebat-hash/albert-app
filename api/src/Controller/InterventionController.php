<?php

namespace App\Controller;

use App\Api\ApiProblem;
use App\Api\Input;
use App\Api\Presenter;
use App\Entity\Intervention;
use App\Entity\SiteMember;
use App\Entity\User;
use App\Service\InterventionService;
use App\Service\SiteAccess;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;
use Symfony\Component\Uid\Uuid;

/**
 * Fiches d'intervention (F-12). L'equipe redige et fait signer ; le client voit les fiches signees.
 */
final class InterventionController extends AbstractController
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly Presenter $present,
        private readonly SiteAccess $access,
        private readonly InterventionService $service,
    ) {}

    #[Route('/api/sites/{id}/interventions', methods: ['GET'])]
    public function list(#[CurrentUser] User $user, string $id): JsonResponse
    {
        $site = $this->access->site($id);
        $m = $this->access->member($site, $user);
        $criteria = ['site' => $site];
        if (!$m->seesTeamContent()) {
            $criteria['status'] = Intervention::STATUS_SIGNED;
        }
        $items = $this->em->getRepository(Intervention::class)->findBy($criteria, ['interventionOn' => 'DESC', 'number' => 'DESC']);
        // Les fiches a signer d'abord : ce sont elles qui attendent quelque chose
        usort($items, fn (Intervention $a, Intervention $b) => [$a->isSigned(), $b->getInterventionOn(), $b->getNumber()] <=> [$b->isSigned(), $a->getInterventionOn(), $a->getNumber()]);
        return $this->json(['items' => array_map(fn (Intervention $i) => $this->present->intervention($i), $items)]);
    }

    #[Route('/api/sites/{id}/interventions', methods: ['POST'])]
    public function create(#[CurrentUser] User $user, string $id, Request $request): JsonResponse
    {
        $site = $this->access->site($id);
        $this->access->requireStaff($this->access->member($site, $user));
        $in = Input::from($request);
        $on = $in->day('interventionOn') ?? new \DateTimeImmutable('today');
        $i = $this->service->create($site, $user, $on, $in->required('title', 'Le titre', 200), $in->required('workDone', 'Les travaux réalisés', 8000));
        $this->apply($i, $in);
        $this->em->flush();
        return $this->json($this->present->intervention($i), 201);
    }

    #[Route('/api/interventions/{id}', methods: ['GET'])]
    public function show(#[CurrentUser] User $user, string $id): JsonResponse
    {
        return $this->json($this->present->intervention($this->find($id, $user)[0]));
    }

    #[Route('/api/interventions/{id}', methods: ['PATCH'])]
    public function update(#[CurrentUser] User $user, string $id, Request $request): JsonResponse
    {
        [$i, $m] = $this->find($id, $user);
        $this->access->requireStaff($m);
        if ($i->isSigned()) {
            throw new ApiProblem('Une fiche signée ne se modifie plus.', 409, 'already_signed');
        }
        $in = Input::from($request);
        if ($in->has('title')) {
            $i->setTitle($in->required('title', 'Le titre', 200));
        }
        if ($in->has('workDone')) {
            $i->setWorkDone($in->required('workDone', 'Les travaux réalisés', 8000));
        }
        if ($in->has('interventionOn')) {
            $i->setInterventionOn($in->day('interventionOn') ?? $i->getInterventionOn());
        }
        $this->apply($i, $in);
        $this->em->flush();
        return $this->json($this->present->intervention($i));
    }

    /** Signature au doigt sur le telephone de l'equipe, tendu au client. */
    #[Route('/api/interventions/{id}/sign', methods: ['POST'])]
    public function sign(#[CurrentUser] User $user, string $id, Request $request): JsonResponse
    {
        [$i, $m] = $this->find($id, $user);
        $this->access->requireStaff($m);
        $in = Input::from($request);
        $strokes = $in->all()['strokes'] ?? null;
        if (!is_array($strokes)) {
            throw ApiProblem::validation(['strokes' => 'La signature est vide. Faites signer dans le cadre.']);
        }
        $this->service->sign(
            $i, $in->required('signerName', 'Le nom du signataire', 160), $strokes,
            (float) ($in->float('width') ?? 1), (float) ($in->float('height') ?? 0.4), $user,
        );
        $this->em->flush();
        return $this->json($this->present->intervention($i));
    }

    private function apply(Intervention $i, Input $in): void
    {
        if ($in->has('materials')) {
            $i->setMaterials($in->string('materials', null, 4000));
        }
        if ($in->has('minutes')) {
            $i->setMinutes($in->int('minutes'));
        }
        if ($in->has('technicians')) {
            $i->setTechnicians($in->string('technicians', null, 255));
        }
    }

    /** @return array{0: Intervention, 1: SiteMember} */
    private function find(string $id, User $user): array
    {
        $i = Uuid::isValid($id) ? $this->em->find(Intervention::class, Uuid::fromString($id)) : null;
        if (!$i) {
            throw new NotFoundHttpException('Fiche d’intervention introuvable.');
        }
        $m = $this->access->member($i->getSite(), $user);
        if (!$m->seesTeamContent() && !$i->isSigned()) {
            throw new NotFoundHttpException('Fiche d’intervention introuvable.');
        }
        return [$i, $m];
    }
}
