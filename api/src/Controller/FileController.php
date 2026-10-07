<?php

namespace App\Controller;

use App\Storage\FileStorage;
use App\Storage\UrlSigner;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\ResponseHeaderBag;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;

/** Sert un fichier uniquement sur URL signee non expiree. */
final class FileController extends AbstractController
{
    #[Route('/files/{key}', requirements: ['key' => '.+'], methods: ['GET'])]
    public function serve(string $key, Request $request, UrlSigner $signer, FileStorage $storage): BinaryFileResponse
    {
        $exp = $request->query->getInt('e');
        $sig = (string) $request->query->get('s');
        if (!$signer->verify($key, $exp, $sig)) {
            throw new AccessDeniedHttpException('Lien expiré.');
        }
        if (!$storage->exists($key)) {
            throw new NotFoundHttpException('Fichier introuvable.');
        }
        $resp = new BinaryFileResponse($storage->path($key));
        $name = (string) $request->query->get('n', '');
        $resp->setContentDisposition(
            $name !== '' ? ResponseHeaderBag::DISPOSITION_ATTACHMENT : ResponseHeaderBag::DISPOSITION_INLINE,
            $name !== '' ? $name : basename($key),
            $name !== '' ? (preg_replace('/[^\x20-\x7e]/', '_', $name) ?: 'document') : basename($key),
        );
        $resp->setPrivate();
        $resp->setMaxAge(max(0, $exp - time()));
        $resp->headers->set('X-Content-Type-Options', 'nosniff');
        return $resp;
    }
}
