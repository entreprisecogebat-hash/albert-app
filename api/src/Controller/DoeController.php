<?php

namespace App\Controller;

use App\Api\ApiProblem;
use App\Api\Input;
use App\Api\Presenter;
use App\Entity\Document;
use App\Entity\ShareLink;
use App\Entity\Site;
use App\Entity\SiteMember;
use App\Entity\User;
use App\Service\ActivityRecorder;
use App\Service\DoeService;
use App\Service\SiteAccess;
use App\Storage\FileStorage;
use App\Storage\UrlSigner;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

/** DOE (F-13) et transmission du dossier (F-14). Generation et partage reserves aux responsables. */
final class DoeController extends AbstractController
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly Presenter $present,
        private readonly SiteAccess $access,
        private readonly DoeService $doe,
        private readonly UrlSigner $signer,
        private readonly FileStorage $storage,
    ) {}

    #[Route('/api/sites/{id}/doe', methods: ['GET'])]
    public function show(#[CurrentUser] User $user, string $id): JsonResponse
    {
        $site = $this->access->site($id);
        return $this->json($this->view($site, $this->access->member($site, $user)));
    }

    #[Route('/api/sites/{id}/doe', methods: ['POST'])]
    public function generate(#[CurrentUser] User $user, string $id): JsonResponse
    {
        $site = $this->access->site($id);
        $m = $this->access->member($site, $user);
        $this->access->requireManager($m);
        $this->doe->generate($site, $user);
        $this->em->flush();
        return $this->json($this->view($site, $m), 201);
    }

    #[Route('/api/sites/{id}/doe/share', methods: ['POST'])]
    public function share(#[CurrentUser] User $user, string $id, Request $request, ActivityRecorder $activity): JsonResponse
    {
        $site = $this->access->site($id);
        $m = $this->access->member($site, $user);
        $this->access->requireManager($m);
        $doc = $this->doeDocument($site) ?? throw new ApiProblem('Générez d’abord le DOE.', 409, 'doe_missing');
        $days = max(1, min(365, Input::from($request)->int('days', 30) ?? 30));
        ShareController::share($this->em, $doc, $days, $user, $activity);
        $this->em->flush();
        return $this->json($this->view($site, $m), 201);
    }

    private function doeDocument(Site $site): ?Document
    {
        $id = $site->getDoeDocumentId();
        return $id ? $this->em->find(Document::class, $id) : null;
    }

    private function view(Site $site, SiteMember $m): array
    {
        $doc = $this->doeDocument($site);
        $client = !$m->seesTeamContent();
        $share = null;
        if ($doc && !$client) {
            $share = $this->em->getRepository(ShareLink::class)->findOneBy(['document' => $doc, 'revokedAt' => null], ['createdAt' => 'DESC']);
            $share = $share?->isActive() ? $share : null;
        }
        $zip = $site->getDoeZipKey();
        $visible = $doc && (!$client || $doc->isVisibleToClient());
        return [
            'siteId' => (string) $site->getId(),
            'sections' => $this->doe->sections($site, $client),
            'documentId' => $visible ? (string) $doc->getId() : null,
            'generatedAt' => $visible ? Presenter::date($site->getDoeGeneratedAt()) : null,
            'zipUrl' => $visible && $zip && $this->storage->exists($zip)
                ? $this->signer->sign($zip, sprintf('DOE_%s.zip', preg_replace('/[^A-Za-z0-9-]+/', '_', $site->getReference() ?? $site->getName())), 3600)
                : null,
            'share' => $share ? $this->present->shareLink($share) : null,
        ];
    }
}
