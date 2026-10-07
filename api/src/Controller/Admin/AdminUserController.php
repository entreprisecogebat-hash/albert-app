<?php

namespace App\Controller\Admin;

use App\Api\ApiProblem;
use App\Api\Input;
use App\Api\Presenter;
use App\Doctrine\TenantScope;
use App\Entity\ApiToken;
use App\Entity\User;
use App\Repository\SiteMemberRepository;
use App\Repository\UserRepository;
use App\Service\PhoneNumber;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;
use Symfony\Component\Uid\Uuid;

/** Annuaire des intervenants et gestion des comptes (F-22). */
#[Route('/api/admin/users')]
final class AdminUserController extends AbstractController
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly Presenter $present,
        private readonly TenantScope $scope,
    ) {}

    #[Route('', methods: ['GET'])]
    public function list(Request $request, UserRepository $users, SiteMemberRepository $members): JsonResponse
    {
        $items = [];
        foreach ($users->search($request->query->get('q'), $request->query->get('kind')) as $u) {
            $items[] = $this->present->user($u) + ['sitesCount' => count($members->forUser($u))];
        }
        return $this->json(['items' => $items]);
    }

    #[Route('', methods: ['POST'])]
    public function create(#[CurrentUser] User $admin, Request $request): JsonResponse
    {
        $in = Input::from($request);
        $phone = $this->phone($in);
        $user = new User($admin->getCompany(), $phone, $in->required('firstName', 'Le prénom', 80), $in->required('lastName', 'Le nom', 80));
        $user->setJobTitle($in->string('jobTitle', null, 120));
        $user->setKind($in->oneOf('kind', [User::KIND_STAFF, User::KIND_CLIENT], User::KIND_STAFF));
        $user->setAdmin($in->bool('admin') && !$user->isClient());
        $this->em->persist($user);
        $this->em->flush();
        return $this->json($this->present->user($user), 201);
    }

    #[Route('/{id}', methods: ['GET'])]
    public function show(string $id, SiteMemberRepository $members): JsonResponse
    {
        $u = $this->find($id);
        return $this->json($this->present->user($u) + [
            'sites' => array_map(fn ($m) => ['role' => $m->getRole(), 'site' => $this->present->site($m->getSite())], $members->forUser($u)),
        ]);
    }

    #[Route('/{id}', methods: ['PATCH'])]
    public function update(#[CurrentUser] User $admin, string $id, Request $request): JsonResponse
    {
        $u = $this->find($id);
        $in = Input::from($request);
        if ($in->has('phone')) {
            $u->setPhone($this->phone($in, $u));
        }
        if ($in->has('firstName')) {
            $u->setFirstName($in->required('firstName', 'Le prénom', 80));
        }
        if ($in->has('lastName')) {
            $u->setLastName($in->required('lastName', 'Le nom', 80));
        }
        if ($in->has('jobTitle')) {
            $u->setJobTitle($in->string('jobTitle', null, 120));
        }
        if ($in->has('kind')) {
            $u->setKind($in->oneOf('kind', [User::KIND_STAFF, User::KIND_CLIENT]));
        }
        if ($in->has('admin')) {
            if ($u === $admin && !$in->bool('admin')) {
                throw new ApiProblem('Vous ne pouvez pas retirer vos propres droits d’administration.', 422);
            }
            $u->setAdmin($in->bool('admin') && !$u->isClient());
        }
        if ($in->has('active')) {
            if ($u === $admin && !$in->bool('active')) {
                throw new ApiProblem('Vous ne pouvez pas désactiver votre propre compte.', 422);
            }
            $u->setActive($in->bool('active'));
            if (!$u->isActive()) {
                // Deconnexion immediate de tous ses telephones
                foreach ($this->em->getRepository(ApiToken::class)->findBy(['user' => $u]) as $t) {
                    $this->em->remove($t);
                }
            }
        }
        $this->em->flush();
        return $this->json($this->present->user($u));
    }

    private function phone(Input $in, ?User $current = null): string
    {
        $phone = PhoneNumber::normalize($in->required('phone', 'Le numéro de téléphone'));
        if (!$phone) {
            throw ApiProblem::validation(['phone' => 'Ce numéro ne semble pas valide.']);
        }
        // Unicite globale (tous tenants) : un numero = un compte
        $other = $this->scope->unfiltered(fn () => $this->em->getRepository(User::class)->findOneBy(['phone' => $phone]));
        if ($other && $other !== $current) {
            throw ApiProblem::validation(['phone' => 'Ce numéro est déjà utilisé par un autre compte.']);
        }
        return $phone;
    }

    private function find(string $id): User
    {
        $u = Uuid::isValid($id) ? $this->em->find(User::class, Uuid::fromString($id)) : null;
        if (!$u) {
            throw new NotFoundHttpException('Utilisateur introuvable.');
        }
        return $u;
    }
}
