<?php

namespace App\Service;

use App\Entity\ActivityEvent;
use App\Entity\Channel;
use App\Entity\Folder;
use App\Entity\Site;
use App\Entity\SiteMember;
use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;

/** Ouverture d'un chantier : arborescence automatique (F-02), deux canaux (F-20), createur responsable. */
final class SiteFactory
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly ActivityRecorder $activity,
    ) {}

    public function create(User $creator, string $name, string $address, array $extra = []): Site
    {
        $site = new Site($creator->getCompany(), $name, $address);
        $site->setReference($extra['reference'] ?? null);
        $site->setClientName($extra['clientName'] ?? null);
        if (!empty($extra['startedOn'])) {
            $site->setStartedOn(new \DateTimeImmutable($extra['startedOn']));
        }
        $this->em->persist($site);

        foreach (array_values($creator->getCompany()->getFolderTemplate()) as $i => $f) {
            $this->em->persist(new Folder($site, $f['name'], $f['kind'] ?? 'custom', $i));
        }
        $this->em->persist(new Channel($site, Channel::KIND_INTERNAL));
        $this->em->persist(new Channel($site, Channel::KIND_CLIENT));

        if (!$creator->isClient()) {
            $this->em->persist(new SiteMember($site, $creator, SiteMember::ROLE_MANAGER));
        }

        $startedOn = $site->getStartedOn();
        $openedAt = $startedOn && $startedOn < new \DateTimeImmutable() ? $startedOn->setTime(8, 0) : null;
        $this->activity->record($site, ActivityEvent::SITE_CREATED, $creator, 'Chantier ouvert', $address, [], 'team', $openedAt);

        return $site;
    }
}
