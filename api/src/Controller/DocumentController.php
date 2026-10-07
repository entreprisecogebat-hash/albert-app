<?php

namespace App\Controller;

use App\Api\ApiProblem;
use App\Api\Input;
use App\Api\Presenter;
use App\Classification\DocumentClassifier;
use App\Classification\TitleNormalizer;
use App\Entity\ActivityEvent;
use App\Entity\Document;
use App\Entity\DocumentVersion;
use App\Entity\FinanceEntry;
use App\Entity\Folder;
use App\Entity\Site;
use App\Entity\SiteMember;
use App\Entity\User;
use App\Repository\ActivityEventRepository;
use App\Repository\DocumentRepository;
use App\Service\ActivityRecorder;
use App\Service\Notifier;
use App\Service\FinanceService;
use App\Service\SiteAccess;
use App\Storage\FileStorage;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\File\UploadedFile;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;
use Symfony\Component\Uid\Uuid;

/**
 * Documents de chantier : depot, classement automatique, versions, recherche (F-01 a F-05).
 */
final class DocumentController extends AbstractController
{
    private const MAX_SIZE = 50 * 1024 * 1024;

    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly Presenter $present,
        private readonly SiteAccess $access,
        private readonly DocumentRepository $documents,
        private readonly DocumentClassifier $classifier,
        private readonly FileStorage $storage,
        private readonly ActivityRecorder $activity,
        private readonly Notifier $notifier,
    ) {}

    /** Liste des documents d'un chantier, par dossier ou par recherche (F-05). */
    #[Route('/api/sites/{id}/documents', methods: ['GET'])]
    public function list(#[CurrentUser] User $user, string $id, Request $request): JsonResponse
    {
        $site = $this->access->site($id);
        $m = $this->access->member($site, $user);
        $docs = $this->documents->search(
            $site,
            $request->query->get('q'),
            $request->query->get('type'),
            $request->query->get('folderId'),
            !$m->seesTeamContent(),
        );
        return $this->json(['items' => array_map(fn (Document $d) => $this->present->document($d), $docs)]);
    }

    /**
     * "Albert a reconnu un plan, version 3." Analyse sans enregistrer : nom du fichier et empreinte.
     * Le telephone calcule l'empreinte SHA-256 localement, le fichier n'est pas envoye a cette etape.
     */
    #[Route('/api/sites/{id}/documents/analyze', methods: ['POST'])]
    public function analyze(#[CurrentUser] User $user, string $id, Request $request): JsonResponse
    {
        $site = $this->access->site($id);
        $this->access->requireStaff($this->access->member($site, $user));
        $in = Input::from($request);
        $sha = $in->string('sha256');
        if ($sha !== null && !preg_match('/^[a-f0-9]{64}$/', $sha)) {
            throw ApiProblem::validation(['sha256' => 'Empreinte invalide.']);
        }
        $proposal = $this->classifier->classify($site, $in->required('filename', 'Le nom du fichier', 255), $sha, $in->string('mimeType'));
        return $this->json($this->present->proposal($proposal));
    }

    /** Depot d'un document ou d'une nouvelle version. Rejouable sans doublon grace a clientId. */
    #[Route('/api/sites/{id}/documents', methods: ['POST'])]
    public function upload(#[CurrentUser] User $user, string $id, Request $request): JsonResponse
    {
        $site = $this->access->site($id);
        $member = $this->access->member($site, $user);
        $this->access->requireStaff($member);
        return $this->store($site, $user, $request, null);
    }

    #[Route('/api/documents/{id}/versions', methods: ['POST'])]
    public function newVersion(#[CurrentUser] User $user, string $id, Request $request): JsonResponse
    {
        $doc = $this->find($id);
        $this->access->requireStaff($this->access->member($doc->getSite(), $user));
        return $this->store($doc->getSite(), $user, $request, $doc);
    }

    /** Fiche document : l'ecran qu'on ouvre le jour ou quelqu'un conteste. */
    #[Route('/api/documents/{id}', methods: ['GET'])]
    public function show(#[CurrentUser] User $user, string $id, ActivityEventRepository $events): JsonResponse
    {
        $doc = $this->find($id);
        $m = $this->access->member($doc->getSite(), $user);
        $this->assertVisible($doc, $m);
        $current = $doc->getCurrentVersion();
        $history = array_filter($events->forDocument($doc), fn (ActivityEvent $e) => $m->seesTeamContent() || $e->getVisibility() === Document::VISIBILITY_CLIENT);

        return $this->json($this->present->document($doc) + [
            'versions' => array_map(fn (DocumentVersion $v) => $this->present->version($v, $v === $current), $this->documents->versions($doc)),
            'history' => array_values(array_map(fn (ActivityEvent $e) => [
                'id' => (string) $e->getId(),
                'type' => $e->getType(),
                'title' => $e->getTitle(),
                'subtitle' => $e->getSubtitle(),
                'actor' => $this->present->actor($e->getActor()),
                'occurredAt' => Presenter::date($e->getOccurredAt()),
                'recordedAt' => Presenter::date($e->getRecordedAt()),
            ], $history)),
            'canEdit' => $m->seesTeamContent(),
            'finance' => $this->financeFor($doc, $m),
        ]);
    }

    /** Piece financiere qui reference ce document (F-07), si l'utilisateur a acces aux finances. */
    private function financeFor(Document $doc, SiteMember $m): ?array
    {
        $mode = FinanceService::mode($m);
        if ($mode === null) {
            return null;
        }
        $entries = $this->em->getRepository(FinanceEntry::class)->findBy(['document' => $doc], ['createdAt' => 'ASC']);
        foreach ($entries as $f) {
            if ($mode === FinanceService::MODE_MANAGE || FinanceService::clientSees($f)) {
                return $this->present->financeRef($f);
            }
        }
        return null;
    }

    /** "Corriger le classement" : type, dossier, titre, visibilite. Trace dans le fil. */
    #[Route('/api/documents/{id}', methods: ['PATCH'])]
    public function update(#[CurrentUser] User $user, string $id, Request $request): JsonResponse
    {
        $doc = $this->find($id);
        $m = $this->access->member($doc->getSite(), $user);
        $this->access->requireStaff($m);
        $in = Input::from($request);
        $changes = [];

        if ($in->has('folderId')) {
            $folder = $this->folder($doc->getSite(), $in->uuid('folderId'));
            if ($folder !== $doc->getFolder()) {
                $doc->setFolder($folder);
                $changes[] = 'classé dans '.$folder->getName();
                if (!$in->has('type')) {
                    $doc->setType(DocumentClassifier::typeForFolderKind($folder->getKind()));
                }
            }
        }
        if ($in->has('type')) {
            $type = $in->oneOf('type', Document::TYPES);
            if ($type !== $doc->getType()) {
                $doc->setType($type);
                $changes[] = 'type corrigé';
            }
        }
        if ($in->has('title')) {
            $title = $in->required('title', 'Le titre', 200);
            if ($title !== $doc->getTitle()) {
                $doc->setTitle($title, TitleNormalizer::normalize($title));
                $changes[] = 'renommé';
            }
        }
        if ($in->has('visibility')) {
            $vis = $in->oneOf('visibility', [Document::VISIBILITY_TEAM, Document::VISIBILITY_CLIENT]);
            if ($vis !== $doc->getVisibility()) {
                if (!$m->isManager() && $vis === Document::VISIBILITY_CLIENT) {
                    throw new AccessDeniedHttpException('Seul un responsable du chantier peut partager un document avec le client.');
                }
                $doc->setVisibility($vis);
                $changes[] = $vis === Document::VISIBILITY_CLIENT ? 'partagé avec le client' : "réservé à l'équipe";
            }
        }
        if ($in->has('contactId')) {
            $cid = $in->uuid('contactId');
            $contact = $cid ? $this->em->find(\App\Entity\Contact::class, $cid) : null;
            if ($cid && (!$contact || $contact->getCompany() !== $doc->getCompany())) {
                throw ApiProblem::validation(['contactId' => 'Contact introuvable.']);
            }
            if ($contact !== $doc->getContact()) {
                $doc->setContact($contact);
                // Le rattachement CRM ne change pas le classement : pas d'evenement dans le fil
                $this->em->flush();
            }
        }
        if ($changes) {
            $doc->setClassifiedBy('user');
            $this->activity->record(
                $doc->getSite(), ActivityEvent::DOCUMENT_RECLASSIFIED, $user, $doc->getTitle(),
                ucfirst(implode(', ', $changes)).'.',
                ['documentId' => (string) $doc->getId(), 'folderName' => $doc->getFolder()->getName()],
                Document::VISIBILITY_TEAM,
            );
            $this->em->flush();
        }
        return $this->json($this->present->document($doc));
    }

    private function store(Site $site, User $user, Request $request, ?Document $target): JsonResponse
    {
        $in = Input::from($request);
        $clientId = $in->uuid('clientId');

        // Rejeu hors ligne : deja recu, on renvoie le meme resultat.
        if ($clientId) {
            $existing = $this->em->getRepository(DocumentVersion::class)->findOneBy(['clientId' => $clientId]);
            if ($existing) {
                return $this->json(['document' => $this->present->document($existing->getDocument()), 'duplicate' => false, 'replayed' => true]);
            }
        }

        $file = $request->files->get('file');
        if (!$file instanceof UploadedFile || !$file->isValid()) {
            throw ApiProblem::validation(['file' => $file instanceof UploadedFile ? $file->getErrorMessage() : 'Aucun fichier reçu.']);
        }
        if ($file->getSize() > self::MAX_SIZE) {
            throw ApiProblem::validation(['file' => 'Ce fichier dépasse 50 Mo.']);
        }
        $originalName = $in->string('filename', null, 255) ?? $file->getClientOriginalName();
        $stored = $this->storage->storeUpload($file, (string) $site->getCompany()->getId(), (string) $site->getId());

        $proposal = $this->classifier->classify($site, $originalName, $stored['sha256'], $stored['mime']);

        // Fichier identique deja present : on ne cree rien, on le dit.
        if ($proposal->duplicateOf && (!$target || $proposal->duplicateOf->getDocument() === $target)) {
            @unlink($this->storage->path($stored['key']));
            return $this->json(['document' => $this->present->document($proposal->duplicateOf->getDocument()), 'duplicate' => true, 'replayed' => false]);
        }

        $target ??= $in->uuid('documentId') ? $this->find((string) $in->uuid('documentId')) : $proposal->newVersionOf;
        if ($target && $target->getSite() !== $site) {
            throw new NotFoundHttpException('Document introuvable.');
        }
        $userCorrected = $in->has('type') || $in->has('folderId') || $in->has('title');
        $writtenAt = $in->date('createdAt');
        $uploadedAt = ($writtenAt && $writtenAt < new \DateTimeImmutable()) ? $writtenAt : null;

        if ($target) {
            $number = $target->nextVersionNumber();
            $extracted = TitleNormalizer::extractVersion($originalName);
            if ($extracted['number'] !== null && $extracted['number'] > $target->getVersionsCount()) {
                $number = $extracted['number'];
            }
            $label = $in->string('versionLabel', null, 20) ?? ($number === $extracted['number'] ? $extracted['label'] : 'V'.$number);
            $previous = $target->getCurrentVersion();
            $version = new DocumentVersion(
                $target, $number, $label, $stored['key'], $originalName, $stored['mime'], $stored['size'],
                $stored['sha256'], $in->string('comment'), $user, $clientId, $uploadedAt,
            );
            $this->em->persist($version);
            $target->addVersion($version);
            $doc = $target;
            $subtitle = $previous
                ? sprintf('Remplace la %s du %s.', $previous->getLabel(), self::frDate($previous->getUploadedAt()))
                : 'Classé dans '.$doc->getFolder()->getName().'.';
            $this->activity->record(
                $site, ActivityEvent::DOCUMENT_VERSION, $user, $doc->getTitle().' '.$label, $subtitle,
                ['documentId' => (string) $doc->getId(), 'versionId' => (string) $version->getId(), 'versionLabel' => $label, 'folderName' => $doc->getFolder()->getName()],
                $doc->getVisibility(), $version->getUploadedAt(),
            );
            $this->notifier->onNewVersion($doc, $label, $user);
        } else {
            $folder = $in->has('folderId') ? $this->folder($site, $in->uuid('folderId')) : $proposal->folder;
            $title = $in->string('title', null, 200) ?? $proposal->title;
            $type = $in->has('type') ? $in->oneOf('type', Document::TYPES) : ($in->has('folderId') ? DocumentClassifier::typeForFolderKind($folder->getKind()) : $proposal->type);
            $doc = new Document($site, $folder, $title, TitleNormalizer::normalize($title), $type, $user);
            $doc->setVisibility($in->oneOf('visibility', [Document::VISIBILITY_TEAM, Document::VISIBILITY_CLIENT], Document::VISIBILITY_TEAM));
            $doc->setClassifiedBy($userCorrected ? 'user' : $proposal->reason);
            $this->em->persist($doc);
            $label = $in->string('versionLabel', null, 20) ?? $proposal->versionLabel;
            $version = new DocumentVersion(
                $doc, $proposal->versionNumber, $label, $stored['key'], $originalName, $stored['mime'], $stored['size'],
                $stored['sha256'], $in->string('comment'), $user, $clientId, $uploadedAt,
            );
            $this->em->persist($version);
            $doc->addVersion($version);
            $this->activity->record(
                $site, ActivityEvent::DOCUMENT_ADDED, $user, $doc->getTitle(),
                ($userCorrected ? 'Classé dans ' : 'Classé automatiquement dans ').$folder->getName().'.',
                ['documentId' => (string) $doc->getId(), 'versionId' => (string) $version->getId(), 'versionLabel' => $label, 'folderName' => $folder->getName()],
                $doc->getVisibility(), $version->getUploadedAt(),
            );
            if ($proposal->ruleId && !$userCorrected) {
                $rule = $this->em->find(\App\Entity\ClassificationRule::class, Uuid::fromString($proposal->ruleId));
                $rule?->hit();
            }
        }
        $this->em->flush();
        $this->notifier->flushPush();

        return $this->json(['document' => $this->present->document($doc), 'duplicate' => false, 'replayed' => false], 201);
    }

    private function find(string $id): Document
    {
        $doc = Uuid::isValid($id) ? $this->em->find(Document::class, Uuid::fromString($id)) : null;
        if (!$doc) {
            throw new NotFoundHttpException('Document introuvable.');
        }
        return $doc;
    }

    private function folder(Site $site, ?Uuid $id): Folder
    {
        $f = $id ? $this->em->find(Folder::class, $id) : null;
        if (!$f || $f->getSite() !== $site) {
            throw ApiProblem::validation(['folderId' => 'Dossier introuvable sur ce chantier.']);
        }
        return $f;
    }

    private function assertVisible(Document $doc, SiteMember $m): void
    {
        if (!$m->seesTeamContent() && !$doc->isVisibleToClient()) {
            throw new NotFoundHttpException('Document introuvable.');
        }
    }

    public static function frDate(\DateTimeInterface $d): string
    {
        static $months = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
        $day = (int) $d->format('j');
        return ($day === 1 ? '1er' : $day).' '.$months[(int) $d->format('n') - 1];
    }
}
