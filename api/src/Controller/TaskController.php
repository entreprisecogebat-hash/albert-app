<?php

namespace App\Controller;

use App\Api\Input;
use App\Api\Presenter;
use App\Entity\ActivityEvent;
use App\Entity\Document;
use App\Entity\Site;
use App\Entity\SiteMember;
use App\Entity\Task;
use App\Entity\User;
use App\Service\ActivityRecorder;
use App\Service\Notifier;
use App\Service\SiteAccess;
use App\Service\UserSites;
use App\Api\ApiProblem;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;
use Symfony\Component\Uid\Uuid;

/** Taches de chantier (F-07, F-18). Internes a l'equipe : le client n'en voit aucune. */
final class TaskController extends AbstractController
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly Presenter $present,
        private readonly SiteAccess $access,
        private readonly UserSites $userSites,
    ) {}

    /** Toutes mes taches, ou celles d'un chantier. Les plus pressees d'abord. */
    #[Route('/api/tasks', methods: ['GET'])]
    public function list(#[CurrentUser] User $user, Request $request): JsonResponse
    {
        if ($user->isClient()) {
            return $this->json(['items' => []]);
        }
        $siteId = $request->query->get('siteId');
        if ($siteId) {
            $site = $this->access->site($siteId);
            $m = $this->access->member($site, $user);
            if (!$m->seesTeamContent()) {
                return $this->json(['items' => []]);
            }
            $sites = [$site];
        } else {
            $sites = $this->userSites->sites($user);
        }
        if (!$sites) {
            return $this->json(['items' => []]);
        }
        $qb = $this->em->createQueryBuilder()->select('t', 's', 'a')->from(Task::class, 't')
            ->join('t.site', 's')->leftJoin('t.assignee', 'a')
            ->where('t.site IN (:sites)')->setParameter('sites', $sites);
        $status = $request->query->get('status');
        if ($status === Task::STATUS_TODO || $status === Task::STATUS_DONE) {
            $qb->andWhere('t.status = :st')->setParameter('st', $status);
        }
        if ($request->query->getBoolean('mine')) {
            $qb->andWhere('t.assignee = :me')->setParameter('me', $user);
        }
        $tasks = $qb->getQuery()->getResult();
        usort($tasks, [self::class, 'compare']);

        return $this->json(['items' => array_map(fn (Task $t) => $this->present->task($t), array_slice($tasks, 0, 300))]);
    }

    #[Route('/api/sites/{id}/tasks', methods: ['POST'])]
    public function create(#[CurrentUser] User $user, string $id, Request $request, Notifier $notifier): JsonResponse
    {
        $site = $this->access->site($id);
        $this->access->requireStaff($this->access->member($site, $user));
        $in = Input::from($request);
        $task = new Task($site, $in->required('title', 'Le titre', 200), $user);
        $this->apply($task, $in, $site);
        $this->em->persist($task);
        $this->notifyAssignee($task, $user, $notifier);
        $this->em->flush();
        $notifier->flushPush();
        return $this->json($this->present->task($task), 201);
    }

    #[Route('/api/tasks/{id}', methods: ['PATCH'])]
    public function update(#[CurrentUser] User $user, string $id, Request $request, ActivityRecorder $activity, Notifier $notifier): JsonResponse
    {
        $task = Uuid::isValid($id) ? $this->em->find(Task::class, Uuid::fromString($id)) : null;
        if (!$task) {
            throw new NotFoundHttpException('Tâche introuvable.');
        }
        $m = $this->access->member($task->getSite(), $user);
        if (!$m->seesTeamContent()) {
            throw new NotFoundHttpException('Tâche introuvable.');
        }
        $in = Input::from($request);
        if ($in->has('title')) {
            $task->setTitle($in->required('title', 'Le titre', 200));
        }
        $before = $task->getAssignee();
        $this->apply($task, $in, $task->getSite());
        if ($task->getAssignee() && $task->getAssignee() !== $before) {
            $this->notifyAssignee($task, $user, $notifier);
        }
        if ($in->has('status')) {
            $done = $in->oneOf('status', [Task::STATUS_TODO, Task::STATUS_DONE]) === Task::STATUS_DONE;
            if ($done !== $task->isDone()) {
                $task->setDone($done);
                if ($done) {
                    $activity->record(
                        $task->getSite(), ActivityEvent::TASK_DONE, $user, $task->getTitle(), null,
                        ['taskId' => (string) $task->getId()], Document::VISIBILITY_TEAM,
                    );
                }
            }
        }
        $this->em->flush();
        $notifier->flushPush();
        return $this->json($this->present->task($task));
    }

    private function apply(Task $task, Input $in, Site $site): void
    {
        if ($in->has('notes')) {
            $task->setNotes($in->string('notes', null, 4000));
        }
        if ($in->has('dueOn')) {
            $task->setDueOn($in->day('dueOn'));
        }
        if ($in->has('priority')) {
            $task->setPriority($in->oneOf('priority', Task::PRIORITIES, 'normal'));
        }
        if ($in->has('assigneeId')) {
            $uid = $in->uuid('assigneeId');
            if ($uid === null) {
                $task->setAssignee(null);
            } else {
                $assignee = $this->em->find(User::class, $uid);
                $membership = $assignee ? $this->em->getRepository(SiteMember::class)->findOneBy(['site' => $site, 'user' => $assignee]) : null;
                if (!$assignee || $assignee->isClient() || (!$membership && !$assignee->isAdmin())) {
                    throw ApiProblem::validation(['assigneeId' => 'Cette personne ne fait pas partie de l’équipe du chantier.']);
                }
                $task->setAssignee($assignee);
            }
        }
    }

    private function notifyAssignee(Task $task, User $by, Notifier $notifier): void
    {
        $a = $task->getAssignee();
        if ($a && $a !== $by) {
            $notifier->notify(
                $a, $task->getSite(), 'task', $task->getSite()->getName(),
                sprintf('%s vous a confié : %s', $by->getFirstName(), $task->getTitle()),
                sprintf('/chantiers/%s/taches', $task->getSite()->getId()),
            );
        }
    }

    /** A faire avant fait ; en retard, puis par echeance ; urgentes d'abord a echeance egale. */
    public static function compare(Task $a, Task $b): int
    {
        if ($a->isDone() !== $b->isDone()) {
            return $a->isDone() ? 1 : -1;
        }
        if ($a->isDone()) {
            return $b->getDoneAt() <=> $a->getDoneAt();
        }
        $da = $a->getDueOn()?->getTimestamp() ?? PHP_INT_MAX;
        $db = $b->getDueOn()?->getTimestamp() ?? PHP_INT_MAX;
        if ($da !== $db) {
            return $da <=> $db;
        }
        if ($a->getPriority() !== $b->getPriority()) {
            return $a->getPriority() === 'urgent' ? -1 : 1;
        }
        return $b->getCreatedAt() <=> $a->getCreatedAt();
    }
}
