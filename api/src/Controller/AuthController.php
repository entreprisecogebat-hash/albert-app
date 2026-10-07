<?php

namespace App\Controller;

use App\Api\ApiProblem;
use App\Api\Input;
use App\Api\Presenter;
use App\Entity\ApiToken;
use App\Entity\LoginCode;
use App\Entity\User;
use App\Service\PhoneNumber;
use App\Service\SmsSender;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\RateLimiter\RateLimiterFactory;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

/**
 * Connexion par numero de telephone et code SMS. Aucun mot de passe a retenir.
 * Un numero inconnu ne peut pas s'inscrire : c'est le responsable qui ajoute ses equipes.
 */
#[Route('/api/auth')]
final class AuthController extends AbstractController
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly Presenter $present,
    ) {}

    #[Route('/request-code', methods: ['POST'])]
    public function requestCode(
        Request $request,
        SmsSender $sms,
        #[Autowire(service: 'limiter.sms_code')] RateLimiterFactory $limiter,
    ): JsonResponse {
        $in = Input::from($request);
        $phone = PhoneNumber::normalize($in->required('phone', 'Le numéro de téléphone'));
        if (!$phone) {
            throw ApiProblem::validation(['phone' => 'Ce numéro ne semble pas valide. Vérifiez-le.']);
        }
        if (!$limiter->create($phone.'|'.$request->getClientIp())->consume()->isAccepted()) {
            throw new ApiProblem('Trop de demandes de code. Réessayez dans quelques minutes.', 429, 'rate_limited');
        }

        $user = $this->em->getRepository(User::class)->findOneBy(['phone' => $phone]);
        if (!$user || !$user->isActive()) {
            throw new ApiProblem(
                "Ce numéro n'est pas encore rattaché à une entreprise. Demandez à votre responsable de vous ajouter.",
                404,
                'unknown_phone',
            );
        }

        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        $this->em->persist(new LoginCode($phone, $code));
        $this->em->flush();
        $sms->sendLoginCode($phone, $code);

        $resp = ['sent' => true, 'phone' => $phone, 'phoneDisplay' => PhoneNumber::format($phone), 'resendIn' => 30];
        if ($sms->exposesCodes()) {
            // Developpement et recette uniquement : pas de vrai SMS, le code est renvoye.
            $resp['devCode'] = $code;
        }
        return $this->json($resp);
    }

    #[Route('/verify', methods: ['POST'])]
    public function verify(Request $request): JsonResponse
    {
        $in = Input::from($request);
        $phone = PhoneNumber::normalize($in->required('phone', 'Le numéro de téléphone'));
        $code = preg_replace('/\D/', '', $in->required('code', 'Le code'));
        if (!$phone || strlen($code) !== 6) {
            throw ApiProblem::validation(['code' => 'Le code contient 6 chiffres.']);
        }

        /** @var LoginCode|null $login */
        $login = $this->em->getRepository(LoginCode::class)->findOneBy(['phone' => $phone], ['createdAt' => 'DESC']);
        $ok = $login && $login->verify($code);
        $this->em->flush();
        if (!$ok) {
            $usable = $login?->isUsable() ?? false;
            throw new ApiProblem(
                $usable ? "Ce code ne correspond pas. Vérifiez le SMS reçu." : 'Ce code a expiré. Demandez-en un nouveau.',
                400,
                $usable ? 'wrong_code' : 'expired_code',
            );
        }

        $user = $this->em->getRepository(User::class)->findOneBy(['phone' => $phone]);
        if (!$user || !$user->isActive()) {
            throw new ApiProblem("Ce compte n'est plus actif.", 403, 'inactive');
        }
        [$token, $plain] = ApiToken::issue($user, $in->string('deviceName', null, 120));
        $user->touchLogin();
        $this->em->persist($token);
        $this->em->flush();

        return $this->json(['token' => $plain, 'user' => $this->present->me($user)]);
    }

    #[Route('/logout', methods: ['POST'])]
    public function logout(Request $request): JsonResponse
    {
        $header = (string) $request->headers->get('Authorization');
        if (str_starts_with($header, 'Bearer ')) {
            $token = $this->em->getRepository(ApiToken::class)->findOneBy(['tokenHash' => ApiToken::hashOf(substr($header, 7))]);
            if ($token) {
                $this->em->remove($token);
                $this->em->flush();
            }
        }
        return $this->json(['ok' => true]);
    }

    #[Route('/me', methods: ['GET'])]
    public function me(#[CurrentUser] User $user): JsonResponse
    {
        return $this->json($this->present->me($user));
    }
}
