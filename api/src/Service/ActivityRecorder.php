<?php

namespace App\Service;

use App\Entity\ActivityEvent;
use App\Entity\Photo;
use App\Entity\Site;
use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;

/** Alimente le fil d'activite (F-08). Ne fait jamais de flush : l'appelant valide la transaction. */
final class ActivityRecorder
{
    public function __construct(private readonly EntityManagerInterface $em) {}

    public function record(
        Site $site,
        string $type,
        ?User $actor,
        string $title,
        ?string $subtitle,
        array $payload,
        string $visibility,
        ?\DateTimeImmutable $occurredAt = null,
    ): ActivityEvent {
        $event = new ActivityEvent($site, $type, $actor, $title, $subtitle, $payload, $visibility, $occurredAt ?? new \DateTimeImmutable());
        $this->em->persist($event);
        $site->touchActivity($event->getOccurredAt());
        return $event;
    }

    /**
     * Les photos d'un meme lot arrivent une par une. Un seul evenement les regroupe :
     * "Reprise de l'etancheite terrasse, 4 photos".
     */
    public function recordPhoto(Photo $photo): ActivityEvent
    {
        $groupKey = 'photos:'.$photo->getBatchId()->toRfc4122();
        $event = $this->em->getRepository(ActivityEvent::class)->findOneBy(['groupKey' => $groupKey]);
        $site = $photo->getSite();

        if (!$event) {
            // Lot deja en cours d'insertion dans cette meme requete ?
            foreach ($this->em->getUnitOfWork()->getScheduledEntityInsertions() as $e) {
                if ($e instanceof ActivityEvent && $e->getGroupKey() === $groupKey) {
                    $event = $e;
                }
            }
        }

        $ids = $event ? ($event->getPayload()['photoIds'] ?? []) : [];
        if (!in_array($photo->getId()->toRfc4122(), $ids, true)) {
            $ids[] = $photo->getId()->toRfc4122();
        }
        $count = count($ids);
        $title = $count > 1 ? $count.' photos' : '1 photo';
        $payload = [
            'batchId' => $photo->getBatchId()->toRfc4122(),
            'photoIds' => $ids,
            'caption' => $photo->getCaption() ?? ($event?->getPayload()['caption'] ?? null),
        ];

        if ($event) {
            $event->mergeBatch($title, $payload, $photo->getTakenAt());
        } else {
            $event = new ActivityEvent(
                $site, ActivityEvent::PHOTOS_ADDED, $photo->getUploadedBy(), $title, $photo->getCaption(),
                $payload, $photo->getVisibility(), $photo->getTakenAt(), $groupKey,
            );
            $this->em->persist($event);
        }
        $site->touchActivity($photo->getTakenAt());
        return $event;
    }
}
