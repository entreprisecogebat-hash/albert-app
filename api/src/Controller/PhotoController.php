<?php

namespace App\Controller;

use App\Api\ApiProblem;
use App\Api\Input;
use App\Api\Presenter;
use App\Entity\Document;
use App\Entity\Photo;
use App\Entity\User;
use App\Message\GeneratePhotoThumbnail;
use App\Service\ActivityRecorder;
use App\Service\SiteAccess;
use App\Storage\FileStorage;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\File\UploadedFile;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Messenger\MessageBusInterface;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;
use Symfony\Component\Uid\Uuid;

/** Photos horodatees et geolocalisees (F-09). */
final class PhotoController extends AbstractController
{
    private const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly Presenter $present,
        private readonly SiteAccess $access,
    ) {}

    /**
     * Une photo par requete, pour que l'envoi reprenne la ou il s'est arrete au retour du reseau.
     * batchId regroupe les photos prises ensemble ; clientId rend l'envoi idempotent.
     */
    #[Route('/api/sites/{id}/photos', methods: ['POST'])]
    public function upload(
        #[CurrentUser] User $user,
        string $id,
        Request $request,
        FileStorage $storage,
        ActivityRecorder $activity,
        MessageBusInterface $bus,
    ): JsonResponse {
        $site = $this->access->site($id);
        $member = $this->access->member($site, $user);
        $this->access->requireStaff($member);
        $in = Input::from($request);

        $clientId = $in->uuid('clientId');
        if ($clientId) {
            $existing = $this->em->getRepository(Photo::class)->findOneBy(['clientId' => $clientId]);
            if ($existing) {
                return $this->json(['photo' => $this->present->photo($existing), 'replayed' => true]);
            }
        }

        $file = $request->files->get('file');
        if (!$file instanceof UploadedFile || !$file->isValid()) {
            throw ApiProblem::validation(['file' => 'Aucune photo reçue.']);
        }
        $mime = $file->getMimeType();
        if (!in_array($mime, self::ALLOWED, true)) {
            throw ApiProblem::validation(['file' => "Ce fichier n'est pas une photo."]);
        }

        $now = new \DateTimeImmutable();
        $takenAt = $in->date('takenAt') ?? $now;
        if ($takenAt > $now->modify('+5 minutes')) {
            $takenAt = $now; // horloge du telephone en avance
        }
        $lat = $in->float('latitude');
        $lng = $in->float('longitude');
        if ($lat !== null && ($lat < -90 || $lat > 90 || $lng === null || $lng < -180 || $lng > 180)) {
            $lat = $lng = null;
        }

        $stored = $storage->storeUpload($file, (string) $site->getCompany()->getId(), (string) $site->getId());
        $photo = new Photo(
            $site,
            $in->uuid('batchId') ?? Uuid::v7(),
            $stored['key'],
            $stored['mime'],
            $stored['size'],
            $stored['sha256'],
            $takenAt,
            $lat,
            $lng,
            $in->float('accuracy'),
            $in->string('caption', null, 255),
            $in->oneOf('visibility', [Document::VISIBILITY_TEAM, Document::VISIBILITY_CLIENT], Document::VISIBILITY_TEAM),
            $user,
            $clientId,
        );
        $this->em->persist($photo);
        $activity->recordPhoto($photo);
        $this->em->flush();

        $bus->dispatch(new GeneratePhotoThumbnail((string) $photo->getId(), (string) $site->getCompany()->getId()));

        return $this->json(['photo' => $this->present->photo($photo), 'replayed' => false], 201);
    }

    #[Route('/api/photos/{id}', methods: ['GET'])]
    public function show(#[CurrentUser] User $user, string $id): JsonResponse
    {
        $photo = Uuid::isValid($id) ? $this->em->find(Photo::class, Uuid::fromString($id)) : null;
        if (!$photo) {
            throw new NotFoundHttpException('Photo introuvable.');
        }
        $m = $this->access->member($photo->getSite(), $user);
        if (!$m->seesTeamContent() && $photo->getVisibility() !== Document::VISIBILITY_CLIENT) {
            throw new NotFoundHttpException('Photo introuvable.');
        }
        return $this->json($this->present->photo($photo));
    }

    /** Galerie du chantier */
    #[Route('/api/sites/{id}/photos', methods: ['GET'])]
    public function list(#[CurrentUser] User $user, string $id, Request $request): JsonResponse
    {
        $site = $this->access->site($id);
        $m = $this->access->member($site, $user);
        $criteria = ['site' => $site];
        if (!$m->seesTeamContent()) {
            $criteria['visibility'] = Document::VISIBILITY_CLIENT;
        }
        if ($request->query->get('batchId') && Uuid::isValid((string) $request->query->get('batchId'))) {
            $criteria['batchId'] = Uuid::fromString((string) $request->query->get('batchId'));
        }
        $photos = $this->em->getRepository(Photo::class)->findBy($criteria, ['takenAt' => 'DESC'], 200);
        return $this->json(['items' => array_map(fn (Photo $p) => $this->present->photo($p), $photos)]);
    }
}
