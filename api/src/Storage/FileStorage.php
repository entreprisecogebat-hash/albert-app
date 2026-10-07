<?php

namespace App\Storage;

use Symfony\Component\HttpFoundation\File\UploadedFile;
use Symfony\Component\Uid\Uuid;

/**
 * Stockage des photos et documents.
 * Dev : disque local. Production : stockage objet S3 Scaleway (fr-par), chiffre au repos.
 * Les cles sont opaques et cloisonnees par entreprise : {company}/{site}/{yyyy}/{mm}/{uuid}.{ext}
 */
final class FileStorage
{
    public function __construct(private readonly string $storageDir) {}

    /** @return array{key: string, size: int, sha256: string, mime: string} */
    public function storeUpload(UploadedFile $file, string $companyId, string $siteId): array
    {
        $ext = strtolower($file->guessExtension() ?: $file->getClientOriginalExtension() ?: 'bin');
        $ext = preg_replace('/[^a-z0-9]/', '', $ext) ?: 'bin';
        $key = sprintf('%s/%s/%s/%s.%s', $companyId, $siteId, date('Y/m'), Uuid::v7()->toRfc4122(), $ext);
        $path = $this->path($key);
        @mkdir(dirname($path), 0775, true);
        $sha = hash_file('sha256', $file->getPathname());
        $mime = $file->getMimeType() ?: 'application/octet-stream';
        $file->move(dirname($path), basename($path));

        return ['key' => $key, 'size' => filesize($path) ?: 0, 'sha256' => $sha, 'mime' => $mime];
    }

    public function putContents(string $key, string $contents): void
    {
        $path = $this->path($key);
        @mkdir(dirname($path), 0775, true);
        file_put_contents($path, $contents);
    }

    public function exists(string $key): bool
    {
        return is_file($this->path($key));
    }

    public function path(string $key): string
    {
        if (str_contains($key, '..') || str_starts_with($key, '/')) {
            throw new \InvalidArgumentException('Cle de fichier invalide.');
        }
        return rtrim($this->storageDir, '/\\').'/'.$key;
    }
}
