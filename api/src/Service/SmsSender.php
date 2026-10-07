<?php

namespace App\Service;

use Psr\Log\LoggerInterface;

/**
 * Envoi du code de connexion.
 * "log" : le code est ecrit dans les logs (dev, recette). Le fournisseur SMS de production
 * (OVHcloud SMS, Brevo...) est a choisir au cadrage ; il se branche ici, via symfony/notifier.
 */
final class SmsSender
{
    public function __construct(
        private readonly LoggerInterface $logger,
        private readonly string $smsTransport,
    ) {}

    public function sendLoginCode(string $phone, string $code): void
    {
        $text = sprintf('Albert : votre code de connexion est %s. Il expire dans 10 minutes.', $code);
        if ($this->smsTransport === 'log') {
            $this->logger->notice('[SMS] {phone} : {text}', ['phone' => $phone, 'text' => $text]);
            return;
        }
        throw new \RuntimeException('Transport SMS non configure : '.$this->smsTransport);
    }

    public function exposesCodes(): bool
    {
        return $this->smsTransport === 'log';
    }
}
