<?php

namespace App\Service;

use App\Entity\Channel;
use App\Entity\DeviceToken;
use App\Entity\Document;
use App\Entity\Message;
use App\Entity\Notification;
use App\Entity\Site;
use App\Entity\SiteMember;
use App\Entity\User;
use App\Message\SendPushNotification;
use App\Repository\SiteMemberRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Messenger\MessageBusInterface;

/**
 * Notifications sur les evenements importants (F-21). Volontairement peu nombreuses :
 *  - un nouveau message dans un canal ou l'on est
 *  - un client qui ecrit (les responsables du chantier)
 *  - une nouvelle version d'un document (l'ancienne ne fait plus foi)
 * Jamais de notification pour sa propre action.
 */
final class Notifier
{
    /** @var list<array{0: list<string>, 1: string, 2: string, 3: array}> */
    private array $pending = [];

    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly SiteMemberRepository $members,
        private readonly MessageBusInterface $bus,
    ) {}

    public function onMessage(Message $m): void
    {
        $channel = $m->getChannel();
        $site = $channel->getSite();
        $author = $m->getAuthor();
        $title = $site->getName().($channel->isClient() ? ' · canal client' : '');
        $body = ($author?->getFullName() ?? 'Albert').' : '.mb_strimwidth($m->getBody(), 0, 140, '…');
        $link = sprintf('/chantiers/%s/messages/%s', $site->getId(), $channel->getKind());

        foreach ($this->members->forSite($site) as $member) {
            if ($author && $member->getUser() === $author) {
                continue;
            }
            if (!$channel->isClient() && $member->isClient()) {
                continue; // le client ne voit pas le canal interne
            }
            $this->notify($member->getUser(), $site, 'message', $title, $body, $link);
        }
    }

    public function onNewVersion(Document $doc, string $label, ?User $actor): void
    {
        $site = $doc->getSite();
        $body = sprintf('%s : la %s fait foi. La version précédente est remplacée.', $doc->getTitle(), $label);
        foreach ($this->members->forSite($site) as $member) {
            if ($actor && $member->getUser() === $actor) {
                continue;
            }
            if ($member->isClient() && !$doc->isVisibleToClient()) {
                continue;
            }
            $this->notify($member->getUser(), $site, 'document_version', $site->getName(), $body, '/documents/'.$doc->getId());
        }
    }

    public function notify(User $user, ?Site $site, string $type, string $title, string $body, ?string $link): void
    {
        if (!$user->isActive()) {
            return;
        }
        $this->em->persist(new Notification($user, $site, $type, $title, $body, $link));
        $tokens = array_map(
            fn (DeviceToken $t) => $t->getToken(),
            $this->em->getRepository(DeviceToken::class)->findBy(['user' => $user]),
        );
        if ($tokens) {
            $this->pending[] = [$tokens, $title, $body, ['link' => $link, 'type' => $type]];
        }
    }

    /** Les push partent apres la validation en base, jamais pour une action annulee. */
    public function flushPush(): void
    {
        foreach ($this->pending as [$tokens, $title, $body, $data]) {
            $this->bus->dispatch(new SendPushNotification($tokens, $title, $body, $data));
        }
        $this->pending = [];
    }
}
