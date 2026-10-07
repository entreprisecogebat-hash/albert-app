<?php

namespace App\Service;

use App\Controller\DocumentController;
use App\Entity\ActivityEvent;
use App\Entity\Document;
use App\Entity\Intervention;
use App\Entity\Photo;
use App\Entity\Reserve;
use App\Entity\Site;
use App\Entity\User;
use App\Pdf\PdfWriter;
use App\Storage\FileStorage;
use Doctrine\ORM\EntityManagerInterface;

/**
 * Dossier des Ouvrages Executes (F-13) et archive de transmission (F-14).
 * Assemble a partir de ce qui est deja dans le chantier : rien a ressaisir.
 * Le PDF (page de garde, index des pieces, interventions, reserves) est range dans le chantier ;
 * l'archive ZIP contient la version en cours de chaque piece et les photos.
 */
final class DoeService
{
    public const TITLE = 'Dossier des Ouvrages Exécutés';

    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly FileStorage $storage,
        private readonly DocumentFiler $filer,
        private readonly ActivityRecorder $activity,
    ) {}

    /** @return list<array{key: string, label: string, count: int}> */
    public function sections(Site $site, bool $clientOnly): array
    {
        $docs = $this->documents($site, $clientOnly);
        $count = fn (array $types) => count(array_filter($docs, fn (Document $d) => in_array($d->getType(), $types, true)));
        $interventions = $this->interventions($site);
        $interventionDocs = array_filter(array_map(fn (Intervention $i) => $i->getDocument()?->getId()->toRfc4122(), $interventions));
        $pv = count(array_filter($docs, fn (Document $d) => $d->getType() === 'pv' && !in_array($d->getId()->toRfc4122(), $interventionDocs, true)));
        $reserves = $this->reserves($site, $clientOnly);
        $qb = $this->em->createQueryBuilder()->select('COUNT(p.id)')->from(Photo::class, 'p')
            ->where('p.site = :s')->setParameter('s', $site);
        if ($clientOnly) {
            $qb->andWhere('p.visibility = :v')->setParameter('v', Document::VISIBILITY_CLIENT);
        }
        $photos = (int) $qb->getQuery()->getSingleScalarResult();

        return [
            ['key' => 'plans', 'label' => 'Plans d’exécution', 'count' => $count(['plan'])],
            ['key' => 'devis_factures', 'label' => 'Devis et factures', 'count' => $count(['devis', 'facture'])],
            ['key' => 'pv', 'label' => 'PV et comptes rendus', 'count' => $pv],
            ['key' => 'interventions', 'label' => 'Fiches d’intervention signées', 'count' => count($interventions)],
            ['key' => 'administratif', 'label' => 'Pièces administratives et notices', 'count' => $count(['administratif', 'autre'])],
            ['key' => 'photos', 'label' => 'Photos', 'count' => $photos],
            ['key' => 'reserves_done', 'label' => 'Réserves levées', 'count' => count(array_filter($reserves, fn (Reserve $r) => $r->isDone()))],
            ['key' => 'reserves_open', 'label' => 'Réserves en cours', 'count' => count(array_filter($reserves, fn (Reserve $r) => !$r->isDone()))],
        ];
    }

    public function generate(Site $site, ?User $by, ?\DateTimeImmutable $at = null): Document
    {
        $at ??= new \DateTimeImmutable();
        $docs = $this->documents($site, false);
        $interventions = $this->interventions($site);
        $reserves = $this->reserves($site, false);
        $photos = $this->em->getRepository(Photo::class)->findBy(['site' => $site], ['takenAt' => 'ASC']);

        $pdf = $this->pdf($site, $docs, $interventions, $reserves, $photos, $at);
        $zipKey = $this->zip($site, $docs, $photos, $at);

        $doc = $this->filer->file(
            $site, 'administratif', self::TITLE, 'administratif',
            sprintf('DOE_%s_%s.pdf', preg_replace('/[^A-Za-z0-9-]+/', '_', $site->getReference() ?? $site->getName()), $at->format('Y-m-d')),
            $pdf, $by, Document::VISIBILITY_CLIENT, $at,
            sprintf('%d pièces, %d photos.', count($docs), count($photos)),
        );
        $site->setDoe($doc, $zipKey, $at);
        $this->activity->record(
            $site, ActivityEvent::DOE_GENERATED, $by, 'DOE généré',
            sprintf('%d pièces, %d fiches d’intervention, %d photos.', count($docs), count($interventions), count($photos)),
            ['documentId' => (string) $doc->getId(), 'versionLabel' => $doc->getCurrentVersion()?->getLabel(), 'folderName' => $doc->getFolder()->getName()],
            Document::VISIBILITY_CLIENT, $at,
        );
        return $doc;
    }

    /** @return list<Document> pieces du chantier (hors DOE lui-meme), dossier puis titre */
    private function documents(Site $site, bool $clientOnly): array
    {
        $qb = $this->em->createQueryBuilder()->select('d', 'f', 'v')->from(Document::class, 'd')
            ->join('d.folder', 'f')->leftJoin('d.currentVersion', 'v')
            ->where('d.site = :s')->setParameter('s', $site)
            ->andWhere('d.normalizedTitle != :doe')->setParameter('doe', \App\Classification\TitleNormalizer::normalize(self::TITLE))
            ->orderBy('f.position', 'ASC')->addOrderBy('d.title', 'ASC');
        if ($clientOnly) {
            $qb->andWhere('d.visibility = :v')->setParameter('v', Document::VISIBILITY_CLIENT);
        }
        return $qb->getQuery()->getResult();
    }

    /** @return list<Intervention> */
    private function interventions(Site $site): array
    {
        return $this->em->getRepository(Intervention::class)->findBy(['site' => $site, 'status' => Intervention::STATUS_SIGNED], ['interventionOn' => 'ASC']);
    }

    /** @return list<Reserve> */
    private function reserves(Site $site, bool $clientOnly): array
    {
        $criteria = ['site' => $site];
        if ($clientOnly) {
            $criteria['visibility'] = Document::VISIBILITY_CLIENT;
        }
        return $this->em->getRepository(Reserve::class)->findBy($criteria, ['reportedAt' => 'ASC']);
    }

    private function pdf(Site $site, array $docs, array $interventions, array $reserves, array $photos, \DateTimeImmutable $at): string
    {
        $p = new PdfWriter();
        $m = PdfWriter::MARGIN;
        $grey = [0.33, 0.35, 0.39];

        // Page de garde
        $p->addPage();
        $p->rect(0, 0, PdfWriter::W, 10, [1, 0.796, 0.067], null);
        $p->text($m, 90, $site->getCompany()->getName(), 12, true, $grey);
        $p->y = 230;
        $p->paragraph(self::TITLE, 28, true);
        $p->y += 8;
        $p->paragraph($site->getName(), 20);
        $p->y += 24;
        $rows = [
            ['Adresse', $site->getAddress()],
            ['Référence', $site->getReference() ?? '-'],
            ['Maître d’ouvrage', $site->getClientName() ?? '-'],
            ['Début des travaux', $site->getStartedOn() ? $site->getStartedOn()->format('d/m/Y') : '-'],
            ['Réception', $site->getDeliveredOn() ? $site->getDeliveredOn()->format('d/m/Y') : 'Non prononcée'],
            ['Dossier établi le', $at->format('d/m/Y')],
        ];
        foreach ($rows as [$k, $v]) {
            $p->y += 18;
            $p->text($m, $p->y, $k, 11, false, $grey);
            $p->text($m + 150, $p->y, mb_strimwidth($v, 0, 60, '…'), 11);
        }
        if ($site->getDeliveredOn()) {
            $d = $site->getDeliveredOn();
            $p->y += 40;
            $p->paragraph('Garanties', 12, true);
            $p->paragraph(sprintf(
                'Parfait achèvement jusqu’au %s. Bon fonctionnement (biennale) jusqu’au %s. Décennale jusqu’au %s.',
                $d->modify('+1 year')->format('d/m/Y'), $d->modify('+2 years')->format('d/m/Y'), $d->modify('+10 years')->format('d/m/Y'),
            ), 10);
        }
        $p->y = PdfWriter::H - 90;
        $p->paragraph('Dossier assemblé par Albert à partir des pièces du chantier. Chaque pièce est listée dans sa version en cours, avec sa date et son auteur ; les versions précédentes restent consultables dans Albert.', 9, false, $m, null, 1.4, [0.45, 0.47, 0.5]);

        // Index des pieces
        $p->addPage();
        $p->paragraph('Index des pièces', 18, true);
        $folder = null;
        $n = 0;
        foreach ($docs as $d) {
            /** @var Document $d */
            if ($d->getFolder()->getName() !== $folder) {
                $folder = $d->getFolder()->getName();
                $p->ensure(40);
                $p->y += 14;
                $p->paragraph($folder, 12, true);
                $p->line($m, $p->y + 2, PdfWriter::W - $m, $p->y + 2);
                $p->y += 4;
            }
            $v = $d->getCurrentVersion();
            ++$n;
            $p->ensure(30);
            $p->y += 13;
            $p->text($m, $p->y, sprintf('%02d', $n), 9, false, $grey);
            $p->text($m + 24, $p->y, mb_strimwidth($d->getTitle(), 0, 58, '…'), 10, true);
            $p->text(PdfWriter::W - $m - 130, $p->y, ($v?->getLabel() ?? '-').'  ·  '.($v ? $v->getUploadedAt()->format('d/m/Y') : ''), 9, false, $grey);
            $p->y += 11;
            $p->text($m + 24, $p->y, mb_strimwidth(($v?->getOriginalName() ?? '').($v?->getUploadedBy() ? ' — déposé par '.$v->getUploadedBy()->getFullName() : ''), 0, 90, '…'), 8, false, $grey);
            $p->y += 3;
        }
        if (!$docs) {
            $p->paragraph('Aucune pièce sur ce chantier.', 10);
        }

        // Interventions
        $p->ensure(80);
        $p->y += 24;
        $p->paragraph('Fiches d’intervention signées', 18, true);
        foreach ($interventions as $i) {
            /** @var Intervention $i */
            $p->ensure(30);
            $p->y += 12;
            $p->text($m, $p->y, $i->getNumber(), 10, true);
            $p->text($m + 100, $p->y, mb_strimwidth($i->getTitle(), 0, 52, '…'), 10);
            $p->text(PdfWriter::W - $m - 70, $p->y, $i->getInterventionOn()->format('d/m/Y'), 9, false, $grey);
            $p->y += 11;
            $p->text($m + 100, $p->y, 'Signée par '.($i->getSignerName() ?? '-'), 8, false, $grey);
        }
        if (!$interventions) {
            $p->paragraph('Aucune fiche signée.', 10);
        }

        // Reserves
        $p->ensure(80);
        $p->y += 24;
        $p->paragraph('Réserves, SAV et garanties', 18, true);
        $labels = ['open' => 'À traiter', 'in_progress' => 'En cours', 'done' => 'Levée'];
        $kinds = ['reserve' => 'Réserve', 'sav' => 'SAV', 'garantie' => 'Garantie'];
        foreach ($reserves as $r) {
            /** @var Reserve $r */
            $p->ensure(30);
            $p->y += 12;
            $p->text($m, $p->y, $kinds[$r->getKind()] ?? $r->getKind(), 9, false, $grey);
            $p->text($m + 60, $p->y, mb_strimwidth($r->getTitle(), 0, 56, '…'), 10);
            $p->text(PdfWriter::W - $m - 110, $p->y, ($labels[$r->getStatus()] ?? '').($r->getDoneAt() ? ' le '.$r->getDoneAt()->format('d/m/Y') : ''), 9, true);
            $p->y += 11;
            $p->text($m + 60, $p->y, 'Signalée le '.$r->getReportedAt()->format('d/m/Y').($r->getLocation() ? ' · '.$r->getLocation() : ''), 8, false, $grey);
        }
        if (!$reserves) {
            $p->paragraph('Aucune réserve.', 10);
        }

        // Photos
        $p->ensure(60);
        $p->y += 24;
        $p->paragraph('Photos', 18, true);
        $p->paragraph(sprintf('%d photos horodatées%s, jointes à l’archive.', count($photos), count(array_filter($photos, fn (Photo $ph) => $ph->getLatitude() !== null)) ? ' et géolocalisées' : ''), 10);
        $shown = 0;
        foreach ($photos as $ph) {
            /** @var Photo $ph */
            if ($shown >= 4 || !$this->storage->exists($ph->getThumbKey() ?? $ph->getFileKey())) {
                continue;
            }
            $data = (string) file_get_contents($this->storage->path($ph->getThumbKey() ?? $ph->getFileKey()));
            if (!str_starts_with($data, "\xFF\xD8")) {
                continue;
            }
            if ($shown % 2 === 0) {
                $p->ensure(170);
                $p->y += 10;
            }
            $x = $m + ($shown % 2) * 245;
            $p->jpeg($data, $x, $p->y, 235, 150);
            if ($shown % 2 === 1) {
                $p->y += 156;
            }
            ++$shown;
        }
        return $p->output();
    }

    /** Archive ZIP de toutes les pieces en cours et des photos ; null si ZipArchive est absent. */
    private function zip(Site $site, array $docs, array $photos, \DateTimeImmutable $at): ?string
    {
        if (!class_exists(\ZipArchive::class)) {
            return null;
        }
        $key = sprintf('%s/%s/doe/DOE_%s.zip', $site->getCompany()->getId(), $site->getId(), $at->format('Ymd_His'));
        $path = $this->storage->path($key);
        @mkdir(dirname($path), 0775, true);
        $zip = new \ZipArchive();
        if ($zip->open($path, \ZipArchive::CREATE | \ZipArchive::OVERWRITE) !== true) {
            return null;
        }
        $used = [];
        $safe = fn (string $s) => trim(preg_replace('/[\\\\\/:*?"<>|]+/', '_', $s) ?? 'piece', ' .');
        foreach ($docs as $d) {
            /** @var Document $d */
            $v = $d->getCurrentVersion();
            if (!$v || !$this->storage->exists($v->getFileKey())) {
                continue;
            }
            $name = $safe($d->getFolder()->getName()).'/'.$safe($v->getOriginalName());
            if (isset($used[$name])) {
                $name = preg_replace('/(\.[^.]+)?$/', '_'.(++$used[$name]).'$1', $name, 1);
            }
            $used[$name] = 1;
            $zip->addFile($this->storage->path($v->getFileKey()), $name);
        }
        foreach ($photos as $i => $ph) {
            /** @var Photo $ph */
            if ($this->storage->exists($ph->getFileKey())) {
                $zip->addFile($this->storage->path($ph->getFileKey()), sprintf('Photos/%s_%02d.jpg', $ph->getTakenAt()->format('Y-m-d_H-i'), $i + 1));
            }
        }
        $zip->addFromString('LISEZ-MOI.txt', sprintf(
            "%s\r\n%s, %s\r\nArchive établie le %s par Albert.\r\nChaque pièce est dans sa version en cours.\r\n",
            self::TITLE, $site->getName(), $site->getAddress(), DocumentController::frDate($at).' '.$at->format('Y'),
        ));
        $zip->close();
        return $key;
    }
}
