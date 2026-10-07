<?php

namespace App\MessageHandler;

use App\Entity\Photo;
use App\Message\GeneratePhotoThumbnail;
use App\Storage\FileStorage;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;
use Symfony\Component\Uid\Uuid;

/** Miniature 640 px pour le fil, generee par le worker (Redis/Doctrine en file asynchrone). */
#[AsMessageHandler]
final class GeneratePhotoThumbnailHandler
{
    private const MAX = 640;

    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly FileStorage $storage,
        private readonly LoggerInterface $logger,
    ) {}

    public function __invoke(GeneratePhotoThumbnail $msg): void
    {
        // Hors requete HTTP : pas de filtre tenant actif, on borne explicitement par entreprise.
        $photo = $this->em->find(Photo::class, Uuid::fromString($msg->photoId));
        if (!$photo || $photo->getCompany()->getId()->toRfc4122() !== $msg->companyId || $photo->getThumbKey()) {
            return;
        }
        $path = $this->storage->path($photo->getFileKey());
        $src = match ($photo->getMimeType()) {
            'image/jpeg' => @imagecreatefromjpeg($path),
            'image/png' => @imagecreatefrompng($path),
            'image/webp' => @imagecreatefromwebp($path),
            default => false,
        };
        if (!$src) {
            $this->logger->warning('Miniature impossible pour {id} ({mime})', ['id' => $msg->photoId, 'mime' => $photo->getMimeType()]);
            return;
        }
        $src = $this->applyExifOrientation($src, $path, $photo->getMimeType());
        $w = imagesx($src);
        $h = imagesy($src);
        $scale = min(1, self::MAX / max($w, $h));
        $tw = max(1, (int) round($w * $scale));
        $th = max(1, (int) round($h * $scale));
        $dst = imagecreatetruecolor($tw, $th);
        imagecopyresampled($dst, $src, 0, 0, 0, 0, $tw, $th, $w, $h);
        ob_start();
        imagejpeg($dst, null, 78);
        $jpeg = (string) ob_get_clean();

        $key = preg_replace('/\.[a-z0-9]+$/', '', $photo->getFileKey()).'_thumb.jpg';
        $this->storage->putContents($key, $jpeg);
        $photo->setThumbnail($key, $w, $h);
        $this->em->flush();
    }

    private function applyExifOrientation(\GdImage $img, string $path, string $mime): \GdImage
    {
        if ($mime !== 'image/jpeg' || !function_exists('exif_read_data')) {
            return $img;
        }
        $exif = @exif_read_data($path);
        $rotated = match ((int) ($exif['Orientation'] ?? 1)) {
            3 => imagerotate($img, 180, 0),
            6 => imagerotate($img, -90, 0),
            8 => imagerotate($img, 90, 0),
            default => $img,
        };
        return $rotated ?: $img;
    }
}
