<?php

namespace App\EventListener;

use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\SecurityBundle\Security;
use Symfony\Component\EventDispatcher\Attribute\AsEventListener;
use Symfony\Component\HttpKernel\Event\RequestEvent;
use Symfony\Component\HttpKernel\KernelEvents;

/**
 * Active le filtre tenant des que l'utilisateur est authentifie.
 * Priorite inferieure au pare-feu (8) : l'utilisateur est deja connu.
 */
#[AsEventListener(event: KernelEvents::REQUEST, priority: 4)]
final class TenantFilterListener
{
    public function __construct(
        private readonly Security $security,
        private readonly EntityManagerInterface $em,
    ) {}

    public function __invoke(RequestEvent $event): void
    {
        if (!$event->isMainRequest()) {
            return;
        }
        $user = $this->security->getUser();
        if (!$user instanceof User) {
            return;
        }
        $filter = $this->em->getFilters()->enable('tenant');
        $filter->setParameter('company_id', $user->getCompany()->getId()->toRfc4122());
    }
}
