<?php

namespace App\Controller;

use App\Api\Input;
use App\Api\Presenter;
use App\Doctrine\TenantScope;
use App\Entity\DeviceToken;
use App\Entity\Notification;
use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

/** Appareil (push) et notifications in-app (F-21). */
final class AccountController extends AbstractController
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly Presenter $present,
    ) {}

    #[Route('/api/devices', methods: ['POST'])]
    public function registerDevice(#[CurrentUser] User $user, Request $request, TenantScope $scope): JsonResponse
    {
        $in = Input::from($request);
        $token = $in->required('token', 'Le jeton', 255);
        $platform = $in->oneOf('platform', ['ios', 'android', 'web'], 'android');
        // Recherche hors filtre tenant : un telephone peut changer de compte.
        $device = $scope->unfiltered(fn () => $this->em->getRepository(DeviceToken::class)->findOneBy(['token' => $token]));
        if ($device) {
            $device->reassign($user, $platform);
        } else {
            $this->em->persist(new DeviceToken($user, $token, $platform));
        }
        $this->em->flush();
        return $this->json(['ok' => true]);
    }

    #[Route('/api/notifications', methods: ['GET'])]
    public function notifications(#[CurrentUser] User $user): JsonResponse
    {
        $items = $this->em->getRepository(Notification::class)->findBy(['user' => $user], ['createdAt' => 'DESC'], 50);
        $unread = count(array_filter($items, fn (Notification $n) => $n->getReadAt() === null));
        return $this->json(['items' => array_map(fn ($n) => $this->present->notification($n), $items), 'unread' => $unread]);
    }

    #[Route('/api/notifications/read', methods: ['POST'])]
    public function markRead(#[CurrentUser] User $user): JsonResponse
    {
        foreach ($this->em->getRepository(Notification::class)->findBy(['user' => $user, 'readAt' => null]) as $n) {
            $n->markRead();
        }
        $this->em->flush();
        return $this->json(['ok' => true]);
    }
}
