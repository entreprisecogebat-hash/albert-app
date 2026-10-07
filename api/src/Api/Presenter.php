<?php

namespace App\Api;

use App\Classification\ClassificationProposal;
use App\Classification\DocumentClassifier;
use App\Entity\ActivityEvent;
use App\Entity\Appointment;
use App\Entity\Channel;
use App\Entity\Contact;
use App\Entity\FinanceEntry;
use App\Entity\FinancePayment;
use App\Entity\FinanceReminder;
use App\Entity\Intervention;
use App\Entity\Reserve;
use App\Entity\ReserveEvent;
use App\Entity\ShareLink;
use App\Entity\Task;
use App\Entity\TimeEntry;
use App\Entity\Company;
use App\Entity\Document;
use App\Entity\DocumentVersion;
use App\Entity\Folder;
use App\Entity\Message;
use App\Entity\Notification;
use App\Entity\Photo;
use App\Entity\Site;
use App\Entity\SiteMember;
use App\Entity\User;
use App\Service\PhoneNumber;
use App\Storage\UrlSigner;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\HttpFoundation\RequestStack;
use Symfony\Component\Uid\Uuid;

/**
 * Le contrat JSON de l'API. Miroir exact de packages/shared/src/types.ts.
 * Les dates sont en ISO 8601 ; le formatage "Il y a 12 min" est fait par les interfaces.
 */
final class Presenter
{
    public function __construct(
        private readonly UrlSigner $signer,
        private readonly EntityManagerInterface $em,
        private readonly RequestStack $requests,
    ) {}

    public static function date(?\DateTimeInterface $d): ?string
    {
        return $d?->format(\DateTimeInterface::ATOM);
    }

    public function company(Company $c): array
    {
        return ['id' => (string) $c->getId(), 'name' => $c->getName(), 'aiEnabled' => $c->isAiEnabled()];
    }

    public function user(User $u, bool $withPhone = true): array
    {
        return [
            'id' => (string) $u->getId(),
            'firstName' => $u->getFirstName(),
            'lastName' => $u->getLastName(),
            'fullName' => $u->getFullName(),
            'jobTitle' => $u->getJobTitle(),
            'kind' => $u->getKind(),
        ] + ($withPhone ? [
            'phone' => $u->getPhone(),
            'phoneDisplay' => PhoneNumber::format($u->getPhone()),
            'admin' => $u->isAdmin(),
            'active' => $u->isActive(),
            'lastLoginAt' => self::date($u->getLastLoginAt()),
            'createdAt' => self::date($u->getCreatedAt()),
        ] : []);
    }

    public function actor(?User $u): ?array
    {
        return $u ? ['id' => (string) $u->getId(), 'fullName' => $u->getFullName(), 'firstName' => $u->getFirstName(), 'kind' => $u->getKind()] : null;
    }

    public function me(User $u): array
    {
        return $this->user($u) + ['company' => $this->company($u->getCompany())];
    }

    public function site(Site $s): array
    {
        return [
            'id' => (string) $s->getId(),
            'name' => $s->getName(),
            'address' => $s->getAddress(),
            'reference' => $s->getReference(),
            'clientName' => $s->getClientName(),
            'startedOn' => $s->getStartedOn()?->format('Y-m-d'),
            'status' => $s->getStatus(),
            'phase' => $s->getPhase(),
            'deliveredOn' => $s->getDeliveredOn()?->format('Y-m-d'),
            'createdAt' => self::date($s->getCreatedAt()),
            'lastActivityAt' => self::date($s->getLastActivityAt()),
        ];
    }

    /** Carte "Mes chantiers" : nom, adresse, derniere activite datee, nouveautes. Rien d'autre. */
    public function siteCard(SiteMember $m, ?ActivityEvent $last, int $newCount, bool $awaitingReply): array
    {
        return $this->site($m->getSite()) + [
            'role' => $m->getRole(),
            'newCount' => $newCount,
            'awaitingReply' => $awaitingReply,
            'lastActivity' => $last ? [
                'type' => $last->getType(),
                'text' => $this->activitySentence($last),
                'at' => self::date($last->getOccurredAt()),
                // La pastille dit la nature de la derniere activite : client (teal), envoye (vert)
                'marker' => $last->getType() === ActivityEvent::MESSAGE && ($last->getPayload()['channel'] ?? '') === Channel::KIND_CLIENT ? 'client' : 'sync',
            ] : null,
        ];
    }

    /** "Sophie a ajoute 4 photos", "Le client a ecrit dans le canal partage" */
    public function activitySentence(ActivityEvent $e): string
    {
        $who = $e->getActor()?->getFirstName() ?? 'Albert';
        if ($e->getActor()?->isClient()) {
            $who = 'Le client';
        }
        return match ($e->getType()) {
            ActivityEvent::PHOTOS_ADDED => sprintf('%s a ajouté %s', $who, $e->getTitle()),
            ActivityEvent::DOCUMENT_ADDED => sprintf('%s a déposé « %s »', $who, $e->getTitle()),
            ActivityEvent::DOCUMENT_VERSION => sprintf('%s a déposé %s', $who, $e->getTitle()),
            ActivityEvent::MESSAGE => ($e->getPayload()['channel'] ?? '') === Channel::KIND_CLIENT
                ? ($e->getActor()?->isClient() ? 'Le client a écrit dans le canal partagé' : sprintf('%s a répondu au client', $who))
                : sprintf('%s a écrit à l\'équipe', $who),
            ActivityEvent::MEMBER_ADDED => $e->getTitle(),
            ActivityEvent::SITE_CREATED => 'Chantier ouvert',
            ActivityEvent::TASK_DONE => sprintf('%s a terminé « %s »', $who, $e->getTitle()),
            ActivityEvent::CLOCK_IN => sprintf('%s est arrivé sur le chantier', $who),
            ActivityEvent::CLOCK_OUT => sprintf('%s a quitté le chantier', $who),
            ActivityEvent::RESERVE_OPENED => sprintf('%s a signalé « %s »', $who, $e->getTitle()),
            default => $e->getTitle(),
        };
    }

    public function folder(Folder $f, ?int $count = null): array
    {
        return [
            'id' => (string) $f->getId(),
            'name' => $f->getName(),
            'kind' => $f->getKind(),
            'parentId' => $f->getParent() ? (string) $f->getParent()->getId() : null,
            'position' => $f->getPosition(),
        ] + ($count !== null ? ['documentsCount' => $count] : []);
    }

    public function version(DocumentVersion $v, bool $isCurrent): array
    {
        return [
            'id' => (string) $v->getId(),
            'number' => $v->getNumber(),
            'label' => $v->getLabel(),
            'originalName' => $v->getOriginalName(),
            'mimeType' => $v->getMimeType(),
            'size' => $v->getSize(),
            'sha256' => $v->getSha256(),
            'comment' => $v->getComment(),
            'uploadedAt' => self::date($v->getUploadedAt()),
            'uploadedBy' => $this->actor($v->getUploadedBy()),
            'isCurrent' => $isCurrent,
            'url' => $this->signer->sign($v->getFileKey()),
            'downloadUrl' => $this->signer->sign($v->getFileKey(), $v->getOriginalName()),
            'clientId' => $v->getClientId()?->toRfc4122(),
        ];
    }

    public function document(Document $d): array
    {
        $cur = $d->getCurrentVersion();
        return [
            'id' => (string) $d->getId(),
            'siteId' => (string) $d->getSite()->getId(),
            'siteName' => $d->getSite()->getName(),
            'title' => $d->getTitle(),
            'type' => $d->getType(),
            'folder' => $this->folder($d->getFolder()),
            'visibility' => $d->getVisibility(),
            'classifiedBy' => $d->getClassifiedBy(),
            'contact' => $d->getContact() ? ['id' => (string) $d->getContact()->getId(), 'name' => $d->getContact()->getName()] : null,
            'versionsCount' => $d->getVersionsCount(),
            'current' => $cur ? $this->version($cur, true) : null,
            'createdBy' => $this->actor($d->getCreatedBy()),
            'createdAt' => self::date($d->getCreatedAt()),
            'updatedAt' => self::date($d->getUpdatedAt()),
        ];
    }

    public function photo(Photo $p): array
    {
        return [
            'id' => (string) $p->getId(),
            'siteId' => (string) $p->getSite()->getId(),
            'batchId' => (string) $p->getBatchId(),
            'url' => $this->signer->sign($p->getFileKey()),
            'thumbUrl' => $this->signer->sign($p->getThumbKey() ?? $p->getFileKey()),
            'mimeType' => $p->getMimeType(),
            'size' => $p->getSize(),
            'sha256' => $p->getSha256(),
            'width' => $p->getWidth(),
            'height' => $p->getHeight(),
            'takenAt' => self::date($p->getTakenAt()),
            'uploadedAt' => self::date($p->getUploadedAt()),
            'latitude' => $p->getLatitude(),
            'longitude' => $p->getLongitude(),
            'accuracy' => $p->getAccuracy(),
            'caption' => $p->getCaption(),
            'visibility' => $p->getVisibility(),
            'uploadedBy' => $this->actor($p->getUploadedBy()),
            'clientId' => $p->getClientId()?->toRfc4122(),
        ];
    }

    public function channel(Channel $c): array
    {
        return [
            'id' => (string) $c->getId(),
            'siteId' => (string) $c->getSite()->getId(),
            'kind' => $c->getKind(),
            'awaitingReply' => $c->isAwaitingReply(),
            'lastMessageAt' => self::date($c->getLastMessageAt()),
        ];
    }

    public function message(Message $m, ?User $viewer = null): array
    {
        return [
            'id' => (string) $m->getId(),
            'channelId' => (string) $m->getChannel()->getId(),
            'channelKind' => $m->getChannel()->getKind(),
            'body' => $m->getBody(),
            'createdAt' => self::date($m->getCreatedAt()),
            'receivedAt' => self::date($m->getReceivedAt()),
            'author' => $this->actor($m->getAuthor()),
            'mine' => $viewer && $m->getAuthor() && (string) $m->getAuthor()->getId() === (string) $viewer->getId(),
            'clientId' => $m->getClientId()?->toRfc4122(),
            'audio' => $m->getAudioKey() ? [
                'url' => $this->signer->sign($m->getAudioKey()),
                'mimeType' => $m->getAudioMime(),
                'durationMs' => $m->getAudioDurationMs(),
            ] : null,
        ];
    }

    public function notification(Notification $n): array
    {
        return [
            'id' => (string) $n->getId(),
            'type' => $n->getType(),
            'title' => $n->getTitle(),
            'body' => $n->getBody(),
            'link' => $n->getLink(),
            'siteId' => $n->getSite() ? (string) $n->getSite()->getId() : null,
            'readAt' => self::date($n->getReadAt()),
            'createdAt' => self::date($n->getCreatedAt()),
        ];
    }

    /**
     * Element du fil (F-08). Photos, documents, messages et evenements cohabitent dans un fil unique.
     * @param array<string, Photo> $photos  photos deja chargees, par id
     */
    public function feedItem(ActivityEvent $e, array $photos = [], array $messages = [], array $channels = []): array
    {
        $p = $e->getPayload();
        $item = [
            'id' => (string) $e->getId(),
            'type' => $e->getType(),
            'title' => $e->getTitle(),
            'subtitle' => $e->getSubtitle(),
            'occurredAt' => self::date($e->getOccurredAt()),
            'recordedAt' => self::date($e->getRecordedAt()),
            'actor' => $this->actor($e->getActor()),
            'visibility' => $e->getVisibility(),
            'documentId' => $p['documentId'] ?? null,
            'versionLabel' => $p['versionLabel'] ?? null,
            'folderName' => $p['folderName'] ?? null,
        ];
        foreach (['taskId', 'interventionId', 'reserveId', 'appointmentId', 'financeId'] as $k) {
            if (isset($p[$k])) {
                $item[$k] = $p[$k];
            }
        }
        if ($e->getType() === ActivityEvent::PHOTOS_ADDED) {
            $list = array_values(array_filter(array_map(fn ($id) => $photos[$id] ?? null, $p['photoIds'] ?? [])));
            usort($list, fn (Photo $a, Photo $b) => $a->getTakenAt() <=> $b->getTakenAt());
            $item['photos'] = array_map(fn (Photo $ph) => $this->photo($ph), $list);
            $item['caption'] = $p['caption'] ?? null;
            if ($list) {
                $item['takenFrom'] = self::date($list[0]->getTakenAt());
                $item['takenTo'] = self::date($list[count($list) - 1]->getTakenAt());
                $geo = array_values(array_filter($list, fn (Photo $ph) => $ph->getLatitude() !== null));
                $item['located'] = count($geo) > 0;
                if ($geo) {
                    $item['latitude'] = $geo[0]->getLatitude();
                    $item['longitude'] = $geo[0]->getLongitude();
                }
            }
        }
        if ($e->getType() === ActivityEvent::MESSAGE) {
            $m = $messages[$p['messageId'] ?? ''] ?? null;
            $ch = $channels[$p['channelId'] ?? ''] ?? null;
            $item['channel'] = $p['channel'] ?? Channel::KIND_INTERNAL;
            $item['body'] = $m?->getBody() ?? $e->getSubtitle();
            $item['awaitingReply'] = $ch && $ch->isClient() && $ch->isAwaitingReply()
                && $m && $ch->getLastMessageAt() == $m->getCreatedAt();
        }
        return $item;
    }

    /** @param list<ActivityEvent> $events */
    public function feed(array $events): array
    {
        $photoIds = [];
        $messageIds = [];
        $channelIds = [];
        foreach ($events as $e) {
            foreach ($e->getPayload()['photoIds'] ?? [] as $id) {
                $photoIds[] = $id;
            }
            if (isset($e->getPayload()['messageId'])) {
                $messageIds[] = $e->getPayload()['messageId'];
                $channelIds[] = $e->getPayload()['channelId'] ?? null;
            }
        }
        $photos = $this->loadById(Photo::class, $photoIds);
        $messages = $this->loadById(Message::class, $messageIds);
        $channels = $this->loadById(Channel::class, array_filter($channelIds));

        return array_map(fn (ActivityEvent $e) => $this->feedItem($e, $photos, $messages, $channels), $events);
    }

    /** {id, name} : reference courte a un chantier */
    public function siteRef(?Site $s): ?array
    {
        return $s ? ['id' => (string) $s->getId(), 'name' => $s->getName()] : null;
    }

    public function contact(Contact $c): array
    {
        $phone = $c->getPhone();
        return [
            'id' => (string) $c->getId(),
            'kind' => $c->getKind(),
            'name' => $c->getName(),
            'companyName' => $c->getCompanyName(),
            'jobTitle' => $c->getJobTitle(),
            'phone' => $phone,
            'phoneDisplay' => $phone ? (str_starts_with($phone, '+') ? PhoneNumber::format($phone) : $phone) : null,
            'email' => $c->getEmail(),
            'address' => $c->getAddress(),
            'notes' => $c->getNotes(),
            'sites' => array_map(fn (Site $s) => $this->siteRef($s), $c->getSites()),
            'createdAt' => self::date($c->getCreatedAt()),
            'updatedAt' => self::date($c->getUpdatedAt()),
        ];
    }

    public function task(Task $t): array
    {
        return [
            'id' => (string) $t->getId(),
            'siteId' => (string) $t->getSite()->getId(),
            'siteName' => $t->getSite()->getName(),
            'title' => $t->getTitle(),
            'notes' => $t->getNotes(),
            'dueOn' => $t->getDueOn()?->format('Y-m-d'),
            'priority' => $t->getPriority(),
            'status' => $t->getStatus(),
            'overdue' => $t->isOverdue(),
            'assignee' => $this->actor($t->getAssignee()),
            'createdBy' => $this->actor($t->getCreatedBy()),
            'createdAt' => self::date($t->getCreatedAt()),
            'doneAt' => self::date($t->getDoneAt()),
        ];
    }

    /** Le client voit le rendez-vous de son chantier, pas la fiche CRM ni les notes internes. */
    public function appointment(Appointment $a, bool $forTeam = true): array
    {
        $c = $forTeam ? $a->getContact() : null;
        return [
            'id' => (string) $a->getId(),
            'title' => $a->getTitle(),
            'startsAt' => self::date($a->getStartsAt()),
            'endsAt' => self::date($a->getEndsAt()),
            'location' => $a->getLocation(),
            'notes' => $forTeam ? $a->getNotes() : null,
            'site' => $this->siteRef($a->getSite()),
            'contact' => $c ? ['id' => (string) $c->getId(), 'name' => $c->getName()] : null,
            'createdBy' => $this->actor($a->getCreatedBy()),
        ];
    }

    public function timeEntry(TimeEntry $e): array
    {
        return [
            'id' => (string) $e->getId(),
            'siteId' => (string) $e->getSite()->getId(),
            'siteName' => $e->getSite()->getName(),
            'user' => $this->actor($e->getUser()),
            'startedAt' => self::date($e->getStartedAt()),
            'endedAt' => self::date($e->getEndedAt()),
            'minutes' => $e->isOpen() ? null : $e->minutes(),
            'startLatitude' => $e->getStartLatitude(),
            'startLongitude' => $e->getStartLongitude(),
            'startDistance' => $e->getStartDistance(),
            'endLatitude' => $e->getEndLatitude(),
            'endLongitude' => $e->getEndLongitude(),
            'note' => $e->getNote(),
        ];
    }

    public function intervention(Intervention $i): array
    {
        return [
            'id' => (string) $i->getId(),
            'siteId' => (string) $i->getSite()->getId(),
            'siteName' => $i->getSite()->getName(),
            'number' => $i->getNumber(),
            'interventionOn' => $i->getInterventionOn()->format('Y-m-d'),
            'title' => $i->getTitle(),
            'workDone' => $i->getWorkDone(),
            'materials' => $i->getMaterials(),
            'minutes' => $i->getMinutes(),
            'technicians' => $i->getTechnicians(),
            'status' => $i->getStatus(),
            'signerName' => $i->getSignerName(),
            'signedAt' => self::date($i->getSignedAt()),
            'signatureUrl' => $i->getSignatureKey() ? $this->signer->sign($i->getSignatureKey()) : null,
            'documentId' => $i->getDocument() ? (string) $i->getDocument()->getId() : null,
            'author' => $this->actor($i->getAuthor()),
            'createdAt' => self::date($i->getCreatedAt()),
        ];
    }

    public function reserve(Reserve $r): array
    {
        return [
            'id' => (string) $r->getId(),
            'siteId' => (string) $r->getSite()->getId(),
            'siteName' => $r->getSite()->getName(),
            'kind' => $r->getKind(),
            'title' => $r->getTitle(),
            'description' => $r->getDescription(),
            'location' => $r->getLocation(),
            'status' => $r->getStatus(),
            'reportedAt' => self::date($r->getReportedAt()),
            'dueOn' => $r->getDueOn()?->format('Y-m-d'),
            'doneAt' => self::date($r->getDoneAt()),
            'overdue' => $r->isOverdue(),
            'reportedBy' => $this->actor($r->getReportedBy()),
            'assignee' => $this->actor($r->getAssignee()),
            'visibility' => $r->getVisibility(),
        ];
    }

    /** @param list<ReserveEvent> $history */
    public function reserveDetail(Reserve $r, array $history, bool $clientOnly): array
    {
        $photos = array_values(array_filter(
            $this->loadById(Photo::class, $r->getPhotoIds()),
            fn (Photo $p) => $p->getSite() === $r->getSite() && (!$clientOnly || $p->getVisibility() === Document::VISIBILITY_CLIENT),
        ));
        usort($photos, fn (Photo $a, Photo $b) => $a->getTakenAt() <=> $b->getTakenAt());
        return $this->reserve($r) + [
            'history' => array_map(fn (ReserveEvent $e) => [
                'id' => (string) $e->getId(),
                'at' => self::date($e->getAt()),
                'actor' => $this->actor($e->getActor()),
                'status' => $e->getStatus(),
                'note' => $e->getNote(),
            ], $history),
            'photos' => array_map(fn (Photo $p) => $this->photo($p), $photos),
        ];
    }

    public function shareLink(ShareLink $l): array
    {
        $base = $this->requests->getMainRequest()?->getSchemeAndHttpHost() ?? '';
        return [
            'id' => (string) $l->getId(),
            'documentId' => (string) $l->getDocument()->getId(),
            'url' => $base.'/s/'.$l->getToken(),
            'expiresAt' => self::date($l->getExpiresAt()),
            'revokedAt' => self::date($l->getRevokedAt()),
            'createdAt' => self::date($l->getCreatedAt()),
            'createdBy' => $this->actor($l->getCreatedBy()),
            'views' => $l->getViews(),
            'active' => $l->isActive(),
        ];
    }

    public function proposal(ClassificationProposal $p): array
    {
        $statement = sprintf('Albert a reconnu %s', DocumentClassifier::typeLabel($p->type));
        if ($p->duplicateOf) {
            $statement = sprintf('Ce fichier est déjà sur le chantier : %s, %s.', $p->title, $p->duplicateOf->getLabel());
        } elseif ($p->newVersionOf || $p->versionNumber > 1) {
            $statement .= sprintf(', version %s.', preg_replace('/^V/', '', $p->versionLabel));
        } else {
            $statement .= '.';
        }
        $prev = $p->newVersionOf?->getCurrentVersion();
        return [
            'title' => $p->title,
            'type' => $p->type,
            'folder' => $this->folder($p->folder),
            'versionNumber' => $p->versionNumber,
            'versionLabel' => $p->versionLabel,
            'reason' => $p->reason,
            'statement' => $statement,
            'newVersionOf' => $p->newVersionOf && !$p->duplicateOf ? [
                'id' => (string) $p->newVersionOf->getId(),
                'title' => $p->newVersionOf->getTitle(),
                'currentLabel' => $prev?->getLabel(),
                'currentUploadedAt' => self::date($prev?->getUploadedAt()),
            ] : null,
            'duplicateOf' => $p->duplicateOf ? [
                'documentId' => (string) $p->duplicateOf->getDocument()->getId(),
                'versionId' => (string) $p->duplicateOf->getId(),
                'label' => $p->duplicateOf->getLabel(),
                'uploadedAt' => self::date($p->duplicateOf->getUploadedAt()),
            ] : null,
        ];
    }

    /**
     * Piece financiere. Pour le client (lecture seule), les notes internes ne sont pas transmises.
     */
    public function financeEntry(FinanceEntry $f, bool $forClient = false): array
    {
        $c = $f->getContact();
        return [
            'id' => (string) $f->getId(),
            'siteId' => (string) $f->getSite()->getId(),
            'siteName' => $f->getSite()->getName(),
            'kind' => $f->getKind(),
            'number' => $f->getNumber(),
            'title' => $f->getTitle(),
            'status' => $f->getStatus(),
            'category' => $f->getCategory(),
            'contact' => $c ? ['id' => (string) $c->getId(), 'name' => $c->getName()] : null,
            'documentId' => $f->getDocument() && (!$forClient || $f->getDocument()->isVisibleToClient()) ? (string) $f->getDocument()->getId() : null,
            'quoteId' => $f->getQuote() ? (string) $f->getQuote()->getId() : null,
            'amountHt' => $f->getAmountHt(),
            'vatRate' => $f->getVatRate(),
            'amountVat' => $f->getAmountVat(),
            'amountTtc' => $f->getAmountTtc(),
            'paid' => $f->getPaid(),
            'remaining' => $f->getRemaining(),
            'issuedOn' => $f->getIssuedOn()?->format('Y-m-d'),
            'dueOn' => $f->getDueOn()?->format('Y-m-d'),
            'overdue' => $f->isOverdue(),
            'remindersCount' => $forClient ? 0 : $f->getRemindersCount(),
            'lastReminderAt' => $forClient ? null : self::date($f->getLastReminderAt()),
            'notes' => $forClient ? null : $f->getNotes(),
            'createdBy' => $this->actor($f->getCreatedBy()),
            'createdAt' => self::date($f->getCreatedAt()),
            'updatedAt' => self::date($f->getUpdatedAt()),
        ];
    }

    public function financeRef(FinanceEntry $f): array
    {
        return [
            'id' => (string) $f->getId(),
            'kind' => $f->getKind(),
            'number' => $f->getNumber(),
            'title' => $f->getTitle(),
            'status' => $f->getStatus(),
            'amountTtc' => $f->getAmountTtc(),
        ];
    }

    public function financePayment(FinancePayment $p): array
    {
        return [
            'id' => (string) $p->getId(),
            'amount' => $p->getAmount(),
            'paidOn' => $p->getPaidOn()->format('Y-m-d'),
            'method' => $p->getMethod(),
            'note' => $p->getNote(),
            'createdBy' => $this->actor($p->getCreatedBy()),
            'createdAt' => self::date($p->getCreatedAt()),
        ];
    }

    public function financeReminder(FinanceReminder $r): array
    {
        return [
            'id' => (string) $r->getId(),
            'at' => self::date($r->getAt()),
            'channel' => $r->getChannel(),
            'note' => $r->getNote(),
            'by' => $this->actor($r->getBy()),
        ];
    }

    /**
     * @template T of object
     * @param class-string<T> $class
     * @return array<string, T>
     */
    private function loadById(string $class, array $ids): array
    {
        $ids = array_values(array_unique(array_filter($ids, fn ($id) => is_string($id) && Uuid::isValid($id))));
        if (!$ids) {
            return [];
        }
        $rows = $this->em->createQueryBuilder()->select('x')->from($class, 'x')
            ->where('x.id IN (:ids)')
            ->setParameter('ids', array_map(fn ($id) => Uuid::fromString($id)->toRfc4122(), $ids))
            ->getQuery()->getResult();
        $out = [];
        foreach ($rows as $r) {
            $out[(string) $r->getId()] = $r;
        }
        return $out;
    }
}
