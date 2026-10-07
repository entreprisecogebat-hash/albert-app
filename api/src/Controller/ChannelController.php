<?php

namespace App\Controller;

use App\Api\Input;
use App\Api\Presenter;
use App\Entity\ActivityEvent;
use App\Entity\Channel;
use App\Entity\Document;
use App\Entity\Message;
use App\Entity\User;
use App\Service\ActivityRecorder;
use App\Service\ChannelSummarizer;
use App\Service\Notifier;
use App\Service\SiteAccess;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;
use Symfony\Component\Uid\Uuid;

/** Messagerie de chantier, canal interne et canal client (F-19, F-20). */
final class ChannelController extends AbstractController
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly Presenter $present,
        private readonly SiteAccess $access,
    ) {}

    #[Route('/api/channels/{id}/messages', methods: ['GET'])]
    public function list(#[CurrentUser] User $user, string $id, Request $request): JsonResponse
    {
        $channel = $this->channel($id, $user);
        $qb = $this->em->createQueryBuilder()
            ->select('m', 'a')->from(Message::class, 'm')->leftJoin('m.author', 'a')
            ->where('m.channel = :c')->setParameter('c', $channel)
            ->orderBy('m.createdAt', 'DESC')
            ->setMaxResults(min(200, max(1, $request->query->getInt('limit', 50))));
        if ($request->query->get('before')) {
            $qb->andWhere('m.createdAt < :b')->setParameter('b', Input::queryDate($request, 'before'));
        }
        if ($request->query->get('after')) {
            $qb->andWhere('m.receivedAt > :a')->setParameter('a', Input::queryDate($request, 'after'));
        }
        $messages = array_reverse($qb->getQuery()->getResult());

        return $this->json([
            'channel' => $this->present->channel($channel),
            'items' => array_map(fn (Message $m) => $this->present->message($m, $user), $messages),
        ]);
    }

    /** Envoi d'un message. Ecrit hors ligne, il garde l'heure a laquelle il a ete ecrit. */
    #[Route('/api/channels/{id}/messages', methods: ['POST'])]
    public function post(
        #[CurrentUser] User $user,
        string $id,
        Request $request,
        ActivityRecorder $activity,
        Notifier $notifier,
    ): JsonResponse {
        $channel = $this->channel($id, $user);
        $in = Input::from($request);
        $clientId = $in->uuid('clientId');
        if ($clientId) {
            $existing = $this->em->getRepository(Message::class)->findOneBy(['clientId' => $clientId]);
            if ($existing) {
                return $this->json($this->present->message($existing, $user));
            }
        }
        $body = $in->required('body', 'Le message', 4000);
        $message = new Message($channel, $user, $body, $clientId, $in->date('createdAt'));
        $this->em->persist($message);
        $channel->onMessage($message);

        $activity->record(
            $channel->getSite(), ActivityEvent::MESSAGE, $user, $body, null,
            ['messageId' => (string) $message->getId(), 'channelId' => (string) $channel->getId(), 'channel' => $channel->getKind()],
            $channel->isClient() ? Document::VISIBILITY_CLIENT : Document::VISIBILITY_TEAM,
            $message->getCreatedAt(),
        );
        $notifier->onMessage($message);
        $this->em->flush();
        $notifier->flushPush();

        return $this->json($this->present->message($message, $user), 201);
    }

    /** Resume des echanges (F-17) : questions en attente, points a retenir. */
    #[Route('/api/channels/{id}/summary', methods: ['GET'])]
    public function summary(#[CurrentUser] User $user, string $id, ChannelSummarizer $summarizer): JsonResponse
    {
        return $this->json($summarizer->summarize($this->channel($id, $user)));
    }

    private function channel(string $id, User $user): Channel
    {
        $channel = Uuid::isValid($id) ? $this->em->find(Channel::class, Uuid::fromString($id)) : null;
        if (!$channel) {
            throw new NotFoundHttpException('Conversation introuvable.');
        }
        $m = $this->access->member($channel->getSite(), $user);
        if (!$channel->isClient() && !$m->seesTeamContent()) {
            throw new NotFoundHttpException('Conversation introuvable.');
        }
        return $channel;
    }
}
