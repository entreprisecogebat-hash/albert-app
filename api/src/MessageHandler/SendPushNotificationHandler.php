<?php

namespace App\MessageHandler;

use App\Message\SendPushNotification;
use Psr\Log\LoggerInterface;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;
use Symfony\Contracts\HttpClient\HttpClientInterface;

/**
 * Push via le service Expo, qui relaie vers APNs (iOS) et FCM (Android).
 * Sans EXPO_PUSH_URL, le push est seulement journalise (dev).
 */
#[AsMessageHandler]
final class SendPushNotificationHandler
{
    public function __construct(
        private readonly HttpClientInterface $http,
        private readonly LoggerInterface $logger,
        private readonly string $expoPushUrl,
    ) {}

    public function __invoke(SendPushNotification $msg): void
    {
        if ($msg->tokens === []) {
            return;
        }
        if ($this->expoPushUrl === '') {
            $this->logger->info('[PUSH] {title} : {body} -> {n} appareil(s)', ['title' => $msg->title, 'body' => $msg->body, 'n' => count($msg->tokens)]);
            return;
        }
        $payload = array_map(fn (string $t) => [
            'to' => $t,
            'title' => $msg->title,
            'body' => $msg->body,
            'data' => $msg->data,
            'sound' => 'default',
        ], $msg->tokens);
        foreach (array_chunk($payload, 100) as $chunk) {
            $this->http->request('POST', $this->expoPushUrl, ['json' => $chunk])->getStatusCode();
        }
    }
}
