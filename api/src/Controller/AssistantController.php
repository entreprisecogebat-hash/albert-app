<?php

namespace App\Controller;

use App\Api\ApiProblem;
use App\Api\Input;
use App\Assistant\CommandParser;
use App\Assistant\Transcriber;
use App\Entity\User;
use App\Service\ClockStateBuilder;
use App\Service\UserSites;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\File\UploadedFile;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

/**
 * Commandes dictees a Albert (appui long sur le bouton +). Rien n'est cree ici :
 * Albert renvoie ce qu'il a entendu et l'action qu'il propose, l'utilisateur valide dans l'app,
 * qui appelle ensuite la route habituelle (chantier, tache, rendez-vous, message, reserve).
 */
final class AssistantController extends AbstractController
{
    /** Un m4a est souvent reconnu comme video/mp4. */
    private const AUDIO = ['audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'audio/x-aac', 'audio/mpeg', 'audio/webm', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/3gpp', 'video/mp4', 'video/3gpp', 'video/webm'];

    #[Route('/api/assistant/command', methods: ['POST'])]
    public function command(
        #[CurrentUser] User $user,
        Request $request,
        Transcriber $transcriber,
        CommandParser $parser,
        UserSites $userSites,
        ClockStateBuilder $clock,
        EntityManagerInterface $em,
    ): JsonResponse {
        if ($user->isClient()) {
            throw new AccessDeniedHttpException('Les commandes vocales sont réservées à l’équipe.');
        }
        $in = Input::from($request);

        // Un enregistrement, ou une phrase deja ecrite (saisie au clavier, essais).
        $file = $request->files->get('file');
        if ($file instanceof UploadedFile) {
            if (!$file->isValid() || !in_array((string) $file->getMimeType(), self::AUDIO, true)) {
                throw ApiProblem::validation(['file' => 'Cet enregistrement est illisible.']);
            }
            if ($file->getSize() > 10 * 1024 * 1024) {
                throw ApiProblem::validation(['file' => 'Enregistrement trop long : une commande tient en quelques phrases.']);
            }
            $text = $transcriber->transcribe($file->getPathname(), $file->getClientOriginalName() ?: 'commande.m4a', (string) $file->getMimeType());
        } else {
            $text = $in->required('text', 'La commande', 1000);
        }

        $sites = [];
        foreach ($userSites->memberships($user) as $m) {
            if ($m->seesTeamContent()) {
                $s = $m->getSite();
                $sites[] = ['id' => (string) $s->getId(), 'name' => $s->getName(), 'clientName' => $s->getClientName()];
            }
        }
        $people = [];
        foreach ($em->getRepository(User::class)->findBy(['company' => $user->getCompany()]) as $u) {
            if (!$u->isClient() && $u->isActive()) {
                $people[] = ['id' => (string) $u->getId(), 'firstName' => $u->getFirstName(), 'fullName' => $u->getFullName()];
            }
        }
        // Le chantier vise par defaut : celui que l'app indique, sinon celui ou l'on est pointe.
        $current = $in->string('siteId', null, 36) ?? ($clock->openEntry($user)?->getSite()->getId()->toRfc4122());

        return $this->json($parser->parse($text, new \DateTimeImmutable(), $sites, $people, (string) $user->getId(), $current));
    }
}
