<?php

namespace App\Api;

final class ApiProblem extends \RuntimeException
{
    public function __construct(
        string $message,
        public readonly int $status = 400,
        public readonly string $errorCode = 'invalid',
        public readonly array $fields = [],
    ) {
        parent::__construct($message);
    }

    public static function validation(array $fields): self
    {
        return new self(reset($fields) ?: 'Formulaire incomplet.', 422, 'validation', $fields);
    }
}
