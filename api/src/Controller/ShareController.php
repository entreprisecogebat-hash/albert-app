<?php

namespace App\Controller;

use App\Api\Input;
use App\Api\Presenter;
use App\Entity\ActivityEvent;
use App\Entity\Document;
use App\Entity\ShareLink;
use App\Entity\User;
use App\Service\ActivityRecorder;
use App\Service\SiteAccess;
use App\Storage\FileStorage;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\ResponseHeaderBag;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;
use Symfony\Component\Uid\Uuid;

/**
 * Partage externe (F-06) : un lien a envoyer par SMS ou par mail, sans compte Albert.
 * Le lien sert toujours la version en cours du document. Il expire et se revoque.
 */
final class ShareController extends AbstractController
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly Presenter $present,
        private readonly SiteAccess $access,
        private readonly FileStorage $storage,
    ) {}

    #[Route('/api/documents/{id}/shares', methods: ['GET'])]
    public function list(#[CurrentUser] User $user, string $id): JsonResponse
    {
        $doc = $this->document($id);
        $this->access->requireStaff($this->access->member($doc->getSite(), $user));
        $links = $this->em->getRepository(ShareLink::class)->findBy(['document' => $doc], ['createdAt' => 'DESC']);
        return $this->json(['items' => array_map(fn (ShareLink $l) => $this->present->shareLink($l), $links)]);
    }

    #[Route('/api/documents/{id}/shares', methods: ['POST'])]
    public function create(#[CurrentUser] User $user, string $id, Request $request, ActivityRecorder $activity): JsonResponse
    {
        $doc = $this->document($id);
        $m = $this->access->member($doc->getSite(), $user);
        if (!$m->isManager()) {
            throw new AccessDeniedHttpException('Seul un responsable du chantier peut créer un lien de partage.');
        }
        $days = max(1, min(90, Input::from($request)->int('days', 7) ?? 7));
        $link = self::share($this->em, $doc, $days, $user, $activity);
        $this->em->flush();
        return $this->json($this->present->shareLink($link), 201);
    }

    #[Route('/api/shares/{id}', methods: ['DELETE'])]
    public function revoke(#[CurrentUser] User $user, string $id): JsonResponse
    {
        $link = Uuid::isValid($id) ? $this->em->find(ShareLink::class, Uuid::fromString($id)) : null;
        if (!$link) {
            throw new NotFoundHttpException('Lien introuvable.');
        }
        if (!$this->access->member($link->getDocument()->getSite(), $user)->isManager()) {
            throw new AccessDeniedHttpException('Seul un responsable du chantier peut révoquer un lien.');
        }
        $link->revoke();
        $this->em->flush();
        return $this->json(['ok' => true]);
    }

    /** Creation partagee avec le DOE (F-14 : transmission du dossier). */
    public static function share(EntityManagerInterface $em, Document $doc, int $days, User $user, ActivityRecorder $activity): ShareLink
    {
        $link = new ShareLink($doc, $days, $user);
        $em->persist($link);
        $activity->record(
            $doc->getSite(), ActivityEvent::SHARE_CREATED, $user, 'Lien de partage : '.$doc->getTitle(),
            sprintf('Valable %d jour%s, jusqu’au %s.', $days, $days > 1 ? 's' : '', DocumentController::frDate($link->getExpiresAt())),
            ['documentId' => (string) $doc->getId()], Document::VISIBILITY_TEAM,
        );
        return $link;
    }

    // ---------- Pages publiques, sans compte ----------

    #[Route('/s/{token}', methods: ['GET'], requirements: ['token' => '[A-Za-z0-9_-]{20,64}'])]
    public function publicPage(string $token): Response
    {
        $link = $this->em->getRepository(ShareLink::class)->findOneBy(['token' => $token]);
        if (!$link) {
            return $this->html('Lien introuvable', '<p>Ce lien n’existe pas. Vérifiez qu’il a été copié en entier.</p>', 404);
        }
        if (!$link->isActive()) {
            return $this->html(
                'Lien expiré',
                sprintf('<p>Ce lien %s.</p><p>Demandez un nouveau lien à %s.</p>',
                    $link->getRevokedAt() ? 'a été désactivé par l’entreprise' : 'a expiré le '.self::e(DocumentController::frDate($link->getExpiresAt()).' '.$link->getExpiresAt()->format('Y')),
                    self::e($link->getCompany()->getName())),
                410,
            );
        }
        $link->viewed();
        $this->em->flush();
        $doc = $link->getDocument();
        $v = $doc->getCurrentVersion();
        $site = $doc->getSite();
        $zip = $site->getDoeDocumentId()?->equals($doc->getId()) && $site->getDoeZipKey() && $this->storage->exists($site->getDoeZipKey());
        $body = sprintf(
            '<p class="k">%s · %s</p><h1>%s</h1><dl><dt>Version</dt><dd>%s</dd><dt>Déposé le</dt><dd>%s</dd><dt>Fichier</dt><dd>%s</dd></dl>'
            .'<a class="btn" href="/s/%s/file">Télécharger</a>%s<p class="m">Lien valable jusqu’au %s. Partagé par %s via Albert.</p>',
            self::e($site->getCompany()->getName()), self::e($site->getName()),
            self::e($doc->getTitle()),
            self::e($v?->getLabel() ?? '-'),
            $v ? self::e(DocumentController::frDate($v->getUploadedAt()).' '.$v->getUploadedAt()->format('Y')) : '-',
            self::e($v?->getOriginalName() ?? '-'),
            self::e($token),
            $zip ? sprintf('<a class="btn btn2" href="/s/%s/zip">Toutes les pièces (ZIP)</a>', self::e($token)) : '',
            self::e(DocumentController::frDate($link->getExpiresAt()).' '.$link->getExpiresAt()->format('Y')),
            self::e($link->getCreatedBy()?->getFullName() ?? $site->getCompany()->getName()),
        );
        return $this->html($doc->getTitle(), $body);
    }

    #[Route('/s/{token}/file', methods: ['GET'], requirements: ['token' => '[A-Za-z0-9_-]{20,64}'])]
    public function publicFile(string $token): Response
    {
        $link = $this->activeLink($token);
        if ($link instanceof Response) {
            return $link;
        }
        $v = $link->getDocument()->getCurrentVersion();
        if (!$v || !$this->storage->exists($v->getFileKey())) {
            return $this->html('Fichier indisponible', '<p>Le fichier n’est plus disponible.</p>', 404);
        }
        return $this->download($this->storage->path($v->getFileKey()), $v->getOriginalName(), $v->getMimeType());
    }

    #[Route('/s/{token}/zip', methods: ['GET'], requirements: ['token' => '[A-Za-z0-9_-]{20,64}'])]
    public function publicZip(string $token): Response
    {
        $link = $this->activeLink($token);
        if ($link instanceof Response) {
            return $link;
        }
        $site = $link->getDocument()->getSite();
        if (!$site->getDoeDocumentId()?->equals($link->getDocument()->getId()) || !$site->getDoeZipKey() || !$this->storage->exists($site->getDoeZipKey())) {
            return $this->html('Archive indisponible', '<p>Aucune archive n’est associée à ce lien.</p>', 404);
        }
        return $this->download($this->storage->path($site->getDoeZipKey()), basename($site->getDoeZipKey()), 'application/zip');
    }

    private function activeLink(string $token): ShareLink|Response
    {
        $link = $this->em->getRepository(ShareLink::class)->findOneBy(['token' => $token]);
        if (!$link) {
            return $this->html('Lien introuvable', '<p>Ce lien n’existe pas.</p>', 404);
        }
        if (!$link->isActive()) {
            return $this->html('Lien expiré', '<p>Ce lien n’est plus valable. Demandez un nouveau lien à l’entreprise.</p>', 410);
        }
        return $link;
    }

    private function download(string $path, string $name, string $mime): BinaryFileResponse
    {
        $resp = new BinaryFileResponse($path);
        $resp->headers->set('Content-Type', $mime);
        $resp->setContentDisposition(ResponseHeaderBag::DISPOSITION_ATTACHMENT, $name, preg_replace('/[^\x20-\x7e]/', '_', $name) ?: 'document');
        $resp->setPrivate();
        $resp->headers->set('X-Content-Type-Options', 'nosniff');
        $resp->headers->set('X-Robots-Tag', 'noindex');
        return $resp;
    }

    private function document(string $id): Document
    {
        $doc = Uuid::isValid($id) ? $this->em->find(Document::class, Uuid::fromString($id)) : null;
        if (!$doc) {
            throw new NotFoundHttpException('Document introuvable.');
        }
        return $doc;
    }

    private static function e(string $s): string
    {
        return htmlspecialchars($s, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    }

    /** Page aux couleurs de la charte Albert : papier, encre, un seul jaune (le bouton). */
    private function html(string $title, string $body, int $status = 200): Response
    {
        $html = '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            .'<meta name="robots" content="noindex"><title>'.self::e($title).' · Albert</title><style>'
            .':root{--bg:#F1F1F1;--paper:#fff;--ink:#333840;--ink2:#434A54;--ink3:#535A64;--rule:rgba(51,56,64,.2);--accent:#FFCB11;--night:#2C3138}'
            .'*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.5 "IBM Plex Sans",system-ui,-apple-system,"Segoe UI",sans-serif}'
            .'header{background:var(--paper);border-bottom:1px solid var(--rule);padding:16px}header b{font:700 22px/1 Archivo,system-ui,sans-serif;letter-spacing:-.02em}'
            .'header span{display:block;width:28px;height:4px;background:var(--accent);margin-top:6px;border-radius:2px}'
            .'main{max-width:560px;margin:24px auto;padding:0 16px}.card{background:var(--paper);border:1px solid var(--rule);border-radius:12px;padding:24px}'
            .'h1{font:700 26px/1.15 Archivo,system-ui,sans-serif;letter-spacing:-.02em;margin:4px 0 16px}.k{color:var(--ink3);font-size:14px;margin:0}'
            .'dl{display:grid;grid-template-columns:auto 1fr;gap:6px 16px;margin:0 0 24px}dt{color:var(--ink3);font-size:14px}dd{margin:0;overflow-wrap:anywhere}'
            .'.btn{display:flex;align-items:center;justify-content:center;min-height:56px;border-radius:999px;background:var(--accent);color:var(--ink);font-weight:600;text-decoration:none;margin-top:8px}'
            .'.btn2{background:var(--paper);border:1px solid var(--rule)}.m{color:var(--ink3);font-size:14px;margin-top:20px}'
            .'</style></head><body><header><b>Albert</b><span></span></header><main><div class="card">'
            .($status >= 400 ? '<h1>'.self::e($title).'</h1>' : '').$body.'</div></main></body></html>';
        $resp = new Response($html, $status, ['Content-Type' => 'text/html; charset=UTF-8', 'X-Robots-Tag' => 'noindex', 'Cache-Control' => 'no-store']);
        return $resp;
    }
}
