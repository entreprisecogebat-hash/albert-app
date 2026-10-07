<?php

namespace App\Service;

use App\Api\Presenter;
use App\Entity\TimeEntry;
use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;

/** Etat du pointage d'une personne : pointage ouvert, temps du jour et de la semaine (F-11). */
final class ClockStateBuilder
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly Presenter $present,
    ) {}

    public function openEntry(User $user): ?TimeEntry
    {
        return $this->em->getRepository(TimeEntry::class)->findOneBy(['user' => $user, 'endedAt' => null], ['startedAt' => 'DESC']);
    }

    public function state(User $user): array
    {
        if ($user->isClient()) {
            return ['open' => null, 'todayMinutes' => 0, 'weekMinutes' => 0];
        }
        $now = new \DateTimeImmutable();
        $today = new \DateTimeImmutable('today');
        /** @var list<TimeEntry> $week */
        $week = $this->em->createQueryBuilder()->select('e')->from(TimeEntry::class, 'e')
            ->where('e.user = :u')->andWhere('e.startedAt >= :m')
            ->setParameter('u', $user)->setParameter('m', new \DateTimeImmutable('monday this week'))
            ->getQuery()->getResult();
        $open = $this->openEntry($user);
        return [
            'open' => $open ? $this->present->timeEntry($open) : null,
            'todayMinutes' => array_sum(array_map(fn (TimeEntry $e) => $e->getStartedAt() >= $today ? $e->minutes($now) : 0, $week)),
            'weekMinutes' => array_sum(array_map(fn (TimeEntry $e) => $e->minutes($now), $week)),
        ];
    }
}
