<?php

namespace App\Controller;

use App\Entity\User;
use App\Service\TodayBuilder;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

/** « Aujourd'hui » : le tableau de priorites ouvert le matin (F-18). */
final class TodayController extends AbstractController
{
    #[Route('/api/today', methods: ['GET'])]
    public function today(#[CurrentUser] User $user, TodayBuilder $builder): JsonResponse
    {
        return $this->json($builder->build($user));
    }
}
