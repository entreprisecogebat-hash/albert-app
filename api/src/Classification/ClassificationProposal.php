<?php

namespace App\Classification;

use App\Entity\Document;
use App\Entity\DocumentVersion;
use App\Entity\Folder;

/**
 * Ce qu'Albert a reconnu. Presente a l'utilisateur comme un constat, corrigeable en un geste.
 */
final class ClassificationProposal
{
    public function __construct(
        public readonly string $title,
        public readonly string $normalizedTitle,
        public readonly string $type,
        public readonly Folder $folder,
        public readonly int $versionNumber,
        public readonly string $versionLabel,
        /** rule | fingerprint | title | default */
        public readonly string $reason,
        public readonly ?Document $newVersionOf = null,
        public readonly ?DocumentVersion $duplicateOf = null,
        public readonly ?string $ruleId = null,
    ) {}
}
