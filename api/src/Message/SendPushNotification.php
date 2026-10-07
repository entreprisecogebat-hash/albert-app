<?php

namespace App\Message;

final class SendPushNotification
{
    /** @param list<string> $tokens */
    public function __construct(
        public readonly array $tokens,
        public readonly string $title,
        public readonly string $body,
        public readonly array $data = [],
    ) {}
}
