<?php

namespace App\Security;

use App\Entity\ApiToken;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Security\Core\Exception\BadCredentialsException;
use Symfony\Component\Security\Http\AccessToken\AccessTokenHandlerInterface;
use Symfony\Component\Security\Http\Authenticator\Passport\Badge\UserBadge;

/** Authentification "Authorization: Bearer alb_..." */
final class ApiTokenHandler implements AccessTokenHandlerInterface
{
    public function __construct(private readonly EntityManagerInterface $em) {}

    public function getUserBadgeFrom(#[\SensitiveParameter] string $accessToken): UserBadge
    {
        $token = $this->em->getRepository(ApiToken::class)->findOneBy(['tokenHash' => ApiToken::hashOf($accessToken)]);
        if (!$token || !$token->isValid()) {
            throw new BadCredentialsException('Session expirée.');
        }
        $token->touch();
        $this->em->flush();
        $user = $token->getUser();

        return new UserBadge($user->getUserIdentifier(), fn () => $user);
    }
}
