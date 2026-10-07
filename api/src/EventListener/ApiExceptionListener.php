<?php

namespace App\EventListener;

use App\Api\ApiProblem;
use Psr\Log\LoggerInterface;
use Symfony\Component\EventDispatcher\Attribute\AsEventListener;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Event\ExceptionEvent;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Symfony\Component\HttpKernel\KernelEvents;

/**
 * Erreurs de l'API en JSON : { "error": "message lisible", "code": "...", "fields": {...} }.
 * Les messages sont destines a l'utilisateur : phrases calmes, en francais, qui disent quoi faire.
 */
#[AsEventListener(event: KernelEvents::EXCEPTION)]
final class ApiExceptionListener
{
    public function __construct(
        private readonly LoggerInterface $logger,
        private readonly string $appEnv,
    ) {}

    public function __invoke(ExceptionEvent $event): void
    {
        $request = $event->getRequest();
        if (!str_starts_with($request->getPathInfo(), '/api/') && !str_starts_with($request->getPathInfo(), '/files/')) {
            return;
        }
        $e = $event->getThrowable();

        if ($e instanceof ApiProblem) {
            $event->setResponse(new JsonResponse(['error' => $e->getMessage(), 'code' => $e->errorCode, 'fields' => $e->fields ?: null], $e->status));
            return;
        }
        if ($e instanceof HttpExceptionInterface) {
            $status = $e->getStatusCode();
            $message = match (true) {
                $status === 401 => 'Votre session a expiré. Reconnectez-vous.',
                $status === 403 && $e->getMessage() === '' => "Vous n'avez pas accès à cette page.",
                $status === 404 && str_starts_with($e->getMessage(), 'No route') => 'Adresse inconnue.',
                $status === 404 && str_contains($e->getMessage(), 'object not found') => 'Élément introuvable.',
                default => $e->getMessage() ?: 'Erreur.',
            };
            $event->setResponse(new JsonResponse(['error' => $message, 'code' => 'http_'.$status], $status, $e->getHeaders()));
            return;
        }

        $this->logger->error($e->getMessage(), ['exception' => $e]);
        $payload = ['error' => "Une erreur est survenue. Elle a été signalée à l'équipe.", 'code' => 'server_error'];
        if ($this->appEnv === 'dev') {
            $payload['debug'] = $e->getMessage().' @ '.$e->getFile().':'.$e->getLine();
        }
        $event->setResponse(new JsonResponse($payload, 500));
    }
}
