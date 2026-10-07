<?php

namespace App\Assistant;

use Symfony\Component\HttpKernel\Exception\ServiceUnavailableHttpException;
use Symfony\Component\Mime\Part\DataPart;
use Symfony\Component\Mime\Part\Multipart\FormDataPart;
use Symfony\Contracts\HttpClient\HttpClientInterface;

/**
 * Transcrit un enregistrement en texte. Parle la route OpenAI /v1/audio/transcriptions :
 * le serveur faster-whisper du projet (scripts/whisper-server.py), speaches, ou un service heberge.
 */
final class Transcriber
{
    public function __construct(
        private readonly HttpClientInterface $http,
        private readonly string $whisperUrl,
    ) {}

    public function transcribe(string $path, string $filename, string $mime): string
    {
        if ($this->whisperUrl === '') {
            throw new ServiceUnavailableHttpException(null, 'La transcription vocale n’est pas configurée sur ce serveur.');
        }
        $form = new FormDataPart([
            'file' => DataPart::fromPath($path, $filename, $mime),
            'language' => 'fr',
            'model' => 'whisper-1',
            'response_format' => 'json',
        ]);
        try {
            $res = $this->http->request('POST', rtrim($this->whisperUrl, '/').'/v1/audio/transcriptions', [
                'headers' => $form->getPreparedHeaders()->toArray(),
                'body' => $form->bodyToIterable(),
                'timeout' => 60,
            ]);
            $data = $res->toArray();
        } catch (\Throwable) {
            throw new ServiceUnavailableHttpException(null, 'Albert n’arrive pas à écouter pour le moment. Réessayez dans un instant.');
        }
        return trim((string) ($data['text'] ?? ''));
    }
}
