<?php

namespace App\Service;

use App\Api\ApiProblem;
use App\Controller\DocumentController;
use App\Entity\ActivityEvent;
use App\Entity\Document;
use App\Entity\Intervention;
use App\Entity\Site;
use App\Entity\User;
use App\Pdf\PdfWriter;
use App\Storage\FileStorage;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Uid\Uuid;

/**
 * Fiche d'intervention (F-12) : numerotation, signature au doigt, PDF range dans le chantier.
 * Utilise par l'API et par les donnees de demonstration : le PDF d'une fiche signee est toujours le meme.
 */
final class InterventionService
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly FileStorage $storage,
        private readonly DocumentFiler $filer,
        private readonly ActivityRecorder $activity,
    ) {}

    /** Prochain numero FI-AAAA-NNNN de l'entreprise (fiches deja creees dans la requete comprises). */
    public function nextNumber(Site $site, \DateTimeImmutable $on): string
    {
        $prefix = sprintf('FI-%s-', $on->format('Y'));
        $max = (string) $this->em->createQueryBuilder()
            ->select('MAX(i.number)')->from(Intervention::class, 'i')
            ->where('i.company = :c')->andWhere('i.number LIKE :p')
            ->setParameter('c', $site->getCompany())->setParameter('p', $prefix.'%')
            ->getQuery()->getSingleScalarResult();
        $n = $max ? (int) substr($max, strlen($prefix)) : 0;
        foreach ($this->em->getUnitOfWork()->getScheduledEntityInsertions() as $e) {
            if ($e instanceof Intervention && str_starts_with($e->getNumber(), $prefix) && $e->getCompany() === $site->getCompany()) {
                $n = max($n, (int) substr($e->getNumber(), strlen($prefix)));
            }
        }
        return $prefix.str_pad((string) ($n + 1), 4, '0', STR_PAD_LEFT);
    }

    public function create(Site $site, User $author, \DateTimeImmutable $on, string $title, string $workDone): Intervention
    {
        $i = new Intervention($site, $this->nextNumber($site, $on), $on, $title, $workDone, $author);
        $this->em->persist($i);
        return $i;
    }

    /**
     * Signature : traits normalises (0..1) dans un cadre width x height.
     * @param list<list<array{0: float|int, 1: float|int}>> $strokes
     */
    public function sign(Intervention $i, string $signerName, array $strokes, float $width, float $height, ?User $by, ?\DateTimeImmutable $at = null): void
    {
        if ($i->isSigned()) {
            throw new ApiProblem('Cette fiche est déjà signée.', 409, 'already_signed');
        }
        $points = 0;
        foreach ($strokes as $s) {
            $points += is_array($s) ? count($s) : 0;
        }
        if ($points < 2) {
            throw ApiProblem::validation(['strokes' => 'La signature est vide. Faites signer dans le cadre.']);
        }
        $at ??= new \DateTimeImmutable();
        $jpeg = self::renderSignature($strokes, $width, $height);
        $site = $i->getSite();
        $key = sprintf('%s/%s/signatures/%s.jpg', $site->getCompany()->getId(), $site->getId(), Uuid::v7()->toRfc4122());
        $this->storage->putContents($key, $jpeg);
        $i->sign($signerName, $key, $at);

        $pdf = $this->pdf($i, $jpeg);
        $doc = $this->filer->file(
            $site, 'pv', 'Fiche d’intervention '.$i->getNumber(), 'pv', $i->getNumber().'.pdf', $pdf, $by,
            Document::VISIBILITY_CLIENT, $at, 'Signée par '.$signerName.'.',
        );
        $i->attachDocument($doc);

        $this->activity->record(
            $site, ActivityEvent::INTERVENTION_SIGNED, $by,
            sprintf('Fiche d’intervention %s signée', $i->getNumber()),
            sprintf('%s. Signée par %s.', $i->getTitle(), $signerName),
            [
                'interventionId' => (string) $i->getId(),
                'documentId' => (string) $doc->getId(),
                'versionLabel' => $doc->getCurrentVersion()?->getLabel(),
                'folderName' => $doc->getFolder()->getName(),
            ],
            Document::VISIBILITY_CLIENT, $at,
        );
    }

    /** Rendu de la signature : encre sombre sur fond blanc, epaisseur constante, en JPEG. */
    public static function renderSignature(array $strokes, float $width, float $height): string
    {
        $ratio = $width > 0 && $height > 0 ? $height / $width : 0.4;
        $w = 900;
        $h = (int) max(200, min(600, round($w * $ratio)));
        $img = imagecreatetruecolor($w, $h);
        imagefill($img, 0, 0, imagecolorallocate($img, 255, 255, 255));
        $ink = imagecolorallocate($img, 28, 36, 52);
        imagesetthickness($img, 5);
        $pad = 12;
        $map = fn ($p) => [
            (int) round($pad + max(0, min(1, (float) ($p[0] ?? 0))) * ($w - 2 * $pad)),
            (int) round($pad + max(0, min(1, (float) ($p[1] ?? 0))) * ($h - 2 * $pad)),
        ];
        foreach ($strokes as $stroke) {
            if (!is_array($stroke)) {
                continue;
            }
            $prev = null;
            foreach ($stroke as $pt) {
                if (!is_array($pt)) {
                    continue;
                }
                $cur = $map($pt);
                if ($prev) {
                    imageline($img, $prev[0], $prev[1], $cur[0], $cur[1], $ink);
                    // arrondis aux jonctions
                    imagefilledellipse($img, $cur[0], $cur[1], 5, 5, $ink);
                } else {
                    imagefilledellipse($img, $cur[0], $cur[1], 5, 5, $ink);
                }
                $prev = $cur;
            }
        }
        ob_start();
        imagejpeg($img, null, 88);
        return (string) ob_get_clean();
    }

    public function pdf(Intervention $i, string $signatureJpeg): string
    {
        $site = $i->getSite();
        $p = new PdfWriter();
        $p->addPage();
        $m = PdfWriter::MARGIN;
        // Bandeau : le jaune Albert en filet, pas en aplat
        $p->rect(0, 0, PdfWriter::W, 6, [1, 0.796, 0.067], null);
        $p->text($m, 64, $site->getCompany()->getName(), 10, true, [0.33, 0.35, 0.39]);
        $p->text(PdfWriter::W - $m - 120, 64, $i->getNumber(), 10, true, [0.33, 0.35, 0.39]);
        $p->y = 80;
        $p->paragraph('Fiche d’intervention', 22, true);
        $p->paragraph($i->getTitle(), 14, false);
        $p->y += 10;
        $p->line($m, $p->y, PdfWriter::W - $m, $p->y);
        $p->y += 8;

        $rows = [
            ['Chantier', $site->getName().($site->getReference() ? ' ('.$site->getReference().')' : '')],
            ['Adresse', $site->getAddress()],
            ['Client', $site->getClientName() ?? '-'],
            ['Date d’intervention', DocumentController::frDate($i->getInterventionOn()).' '.$i->getInterventionOn()->format('Y')],
            ['Intervenants', $i->getTechnicians() ?? ($i->getAuthor()?->getFullName() ?? '-')],
            ['Durée', $i->getMinutes() ? self::duration($i->getMinutes()) : '-'],
        ];
        foreach ($rows as [$k, $v]) {
            $p->ensure(18);
            $p->y += 14;
            $p->text($m, $p->y, $k, 10, false, [0.33, 0.35, 0.39]);
            $p->text($m + 140, $p->y, mb_strimwidth($v, 0, 70, '…'), 11);
            $p->y += 4;
        }
        $p->y += 14;
        $p->paragraph('Travaux réalisés', 12, true);
        $p->y += 2;
        $p->paragraph($i->getWorkDone(), 11);
        if ($i->getMaterials()) {
            $p->y += 10;
            $p->paragraph('Fournitures et matériel', 12, true);
            $p->y += 2;
            $p->paragraph($i->getMaterials(), 11);
        }

        $p->ensure(190);
        $p->y += 22;
        $p->paragraph('Signature du client', 12, true);
        $p->y += 6;
        $boxY = $p->y;
        $p->rect($m, $boxY, 260, 110);
        $p->jpeg($signatureJpeg, $m + 6, $boxY + 6, 248, 98);
        $p->y = $boxY + 110 + 16;
        $at = $i->getSignedAt() ?? new \DateTimeImmutable();
        $p->paragraph(sprintf('Signé par %s, le %s à %s.', $i->getSignerName(), $at->format('d/m/Y'), $at->format('H:i')), 10);
        $p->paragraph('Le client reconnaît que les travaux décrits ci-dessus ont été réalisés. Document généré par Albert, horodaté par le serveur.', 9, false, PdfWriter::MARGIN, null, 1.4, [0.45, 0.47, 0.5]);
        return $p->output();
    }

    public static function duration(int $minutes): string
    {
        $h = intdiv($minutes, 60);
        $mn = $minutes % 60;
        return $h ? ($mn ? sprintf('%d h %02d', $h, $mn) : $h.' h') : $mn.' min';
    }
}
