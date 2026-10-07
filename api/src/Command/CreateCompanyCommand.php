<?php

namespace App\Command;

use App\Service\CompanyProvisioner;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Attribute\Argument;
use Symfony\Component\Console\Style\SymfonyStyle;

#[AsCommand(name: 'albert:company:create', description: 'Ouvre une entreprise cliente et son premier administrateur')]
final class CreateCompanyCommand
{
    public function __construct(
        private readonly CompanyProvisioner $provisioner,
        private readonly EntityManagerInterface $em,
    ) {}

    public function __invoke(
        SymfonyStyle $io,
        #[Argument('Nom de l\'entreprise')] string $name,
        #[Argument('Identifiant court (slug)')] string $slug,
        #[Argument('Téléphone de l\'administrateur')] string $phone,
        #[Argument('Prénom')] string $firstName,
        #[Argument('Nom')] string $lastName,
    ): int {
        $admin = $this->provisioner->create($name, $slug, $phone, $firstName, $lastName);
        $this->em->flush();
        $io->success(sprintf('%s ouverte. Administrateur : %s (%s)', $name, $admin->getFullName(), $admin->getPhone()));
        return 0;
    }
}
