<?php

namespace App\Storage;

use Symfony\Component\HttpFoundation\RequestStack;

/**
 * URL signees a duree limitee : un fichier n'est jamais servi sans signature valide.
 * Equivalent local des URL pre-signees S3 de la production.
 */
final class UrlSigner
{
    public function __construct(
        private readonly string $appSecret,
        private readonly int $signedUrlTtl,
        private readonly RequestStack $requests,
    ) {}

    public function sign(string $key, ?string $downloadName = null, ?int $ttl = null): string
    {
        $exp = time() + ($ttl ?? $this->signedUrlTtl);
        $query = ['e' => $exp, 's' => $this->signature($key, $exp)];
        if ($downloadName) {
            $query['n'] = $downloadName;
        }
        $base = $this->requests->getMainRequest()?->getSchemeAndHttpHost() ?? '';
        return $base.'/files/'.$key.'?'.http_build_query($query);
    }

    public function verify(string $key, int $exp, string $sig): bool
    {
        return $exp >= time() && hash_equals($this->signature($key, $exp), $sig);
    }

    private function signature(string $key, int $exp): string
    {
        return hash_hmac('sha256', $key.'|'.$exp, $this->appSecret);
    }
}
