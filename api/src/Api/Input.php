<?php

namespace App\Api;

use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Uid\Uuid;

/** Lecture tolerante du corps JSON ou multipart, avec messages d'erreur en francais. */
final class Input
{
    private array $data;

    private function __construct(array $data)
    {
        $this->data = $data;
    }

    public static function from(Request $request): self
    {
        if (str_contains((string) $request->headers->get('Content-Type'), 'json')) {
            $raw = $request->getContent();
            $data = $raw === '' ? [] : json_decode($raw, true);
            if (!is_array($data)) {
                throw new ApiProblem('Requête illisible.', 400, 'bad_json');
            }
            return new self($data);
        }
        return new self($request->request->all());
    }

    public function has(string $k): bool { return array_key_exists($k, $this->data); }
    public function all(): array { return $this->data; }

    public function string(string $k, ?string $default = null, int $max = 2000): ?string
    {
        $v = $this->data[$k] ?? null;
        if ($v === null || $v === '') {
            return $default;
        }
        if (!is_scalar($v)) {
            throw ApiProblem::validation([$k => 'Valeur invalide.']);
        }
        $s = trim((string) $v);
        return $s === '' ? $default : mb_substr($s, 0, $max);
    }

    public function required(string $k, string $label, int $max = 2000): string
    {
        $v = $this->string($k, null, $max);
        if ($v === null) {
            throw ApiProblem::validation([$k => sprintf('%s est obligatoire.', $label)]);
        }
        return $v;
    }

    public function bool(string $k, bool $default = false): bool
    {
        $v = $this->data[$k] ?? null;
        if ($v === null) {
            return $default;
        }
        return filter_var($v, FILTER_VALIDATE_BOOLEAN);
    }

    public function float(string $k): ?float
    {
        $v = $this->data[$k] ?? null;
        return is_numeric($v) ? (float) $v : null;
    }

    public function int(string $k, ?int $default = null): ?int
    {
        $v = $this->data[$k] ?? null;
        return is_numeric($v) ? (int) $v : $default;
    }

    public function uuid(string $k): ?Uuid
    {
        $v = $this->string($k);
        if ($v === null) {
            return null;
        }
        if (!Uuid::isValid($v)) {
            throw ApiProblem::validation([$k => 'Identifiant invalide.']);
        }
        return Uuid::fromString($v);
    }

    public function date(string $k): ?\DateTimeImmutable
    {
        $v = $this->string($k);
        if ($v === null) {
            return null;
        }
        try {
            // Le telephone envoie de l'UTC ("...Z") : on ramene a l'heure du serveur avant stockage,
            // sinon une photo prise a 16:38 a Paris serait enregistree a 14:38.
            return (new \DateTimeImmutable($v))->setTimezone(new \DateTimeZone(date_default_timezone_get()));
        } catch (\Exception) {
            throw ApiProblem::validation([$k => 'Date invalide.']);
        }
    }

    /** Jour calendaire "AAAA-MM-JJ" (echeance, date d'intervention), sans heure ni fuseau. */
    public function day(string $k): ?\DateTimeImmutable
    {
        $v = $this->string($k);
        if ($v === null) {
            return null;
        }
        $d = \DateTimeImmutable::createFromFormat('!Y-m-d', substr($v, 0, 10));
        if (!$d) {
            throw ApiProblem::validation([$k => 'Date invalide (AAAA-MM-JJ).']);
        }
        return $d;
    }

    /** Liste d'identifiants (["uuid", ...]) */
    public function uuids(string $k): array
    {
        $v = $this->data[$k] ?? [];
        if (!is_array($v)) {
            throw ApiProblem::validation([$k => 'Liste attendue.']);
        }
        $out = [];
        foreach ($v as $id) {
            if (!is_string($id) || !Uuid::isValid($id)) {
                throw ApiProblem::validation([$k => 'Identifiant invalide.']);
            }
            $out[] = Uuid::fromString($id);
        }
        return $out;
    }

    /** Date passee en parametre d'URL (pagination), ramenee a l'heure du serveur. */
    public static function queryDate(Request $request, string $k): ?\DateTimeImmutable
    {
        $v = $request->query->get($k);
        if (!is_string($v) || $v === '') {
            return null;
        }
        try {
            return (new \DateTimeImmutable($v))->setTimezone(new \DateTimeZone(date_default_timezone_get()));
        } catch (\Exception) {
            throw ApiProblem::validation([$k => 'Date invalide.']);
        }
    }

    public function oneOf(string $k, array $allowed, ?string $default = null): ?string
    {
        $v = $this->string($k, $default);
        if ($v !== null && !in_array($v, $allowed, true)) {
            throw ApiProblem::validation([$k => 'Valeur non autorisée.']);
        }
        return $v;
    }
}
