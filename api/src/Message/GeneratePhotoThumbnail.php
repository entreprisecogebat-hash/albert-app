<?php

namespace App\Message;

final class GeneratePhotoThumbnail
{
    public function __construct(
        public readonly string $photoId,
        public readonly string $companyId,
    ) {}
}
