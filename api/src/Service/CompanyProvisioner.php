<?php

namespace App\Service;

use App\Entity\ClassificationRule;
use App\Entity\Company;
use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;

/** Ouverture d'une entreprise cliente : regles de classement par defaut et premier administrateur. */
final class CompanyProvisioner
{
    public function __construct(private readonly EntityManagerInterface $em) {}

    public function create(string $name, string $slug, string $adminPhone, string $adminFirstName, string $adminLastName): User
    {
        $phone = PhoneNumber::normalize($adminPhone) ?? throw new \InvalidArgumentException('Numéro invalide : '.$adminPhone);
        $company = new Company($name, $slug);
        $this->em->persist($company);
        foreach (ClassificationRule::DEFAULTS as $i => $r) {
            $this->em->persist(new ClassificationRule($company, $r['pattern'], $r['type'], $r['folderKind'], ($i + 1) * 10, 'default'));
        }
        $admin = new User($company, $phone, $adminFirstName, $adminLastName);
        $admin->setAdmin(true);
        $this->em->persist($admin);
        return $admin;
    }
}
