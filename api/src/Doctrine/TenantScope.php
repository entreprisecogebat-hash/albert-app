<?php

namespace App\Doctrine;

use Doctrine\ORM\EntityManagerInterface;

/** Suspend le filtre tenant le temps d'une verification globale (unicite d'un numero, d'un appareil). */
final class TenantScope
{
    public function __construct(private readonly EntityManagerInterface $em) {}

    /**
     * @template T
     * @param callable(): T $fn
     * @return T
     */
    public function unfiltered(callable $fn): mixed
    {
        $filters = $this->em->getFilters();
        if (!$filters->isEnabled('tenant')) {
            return $fn();
        }
        $companyId = $filters->getFilter('tenant')->getParameter('company_id');
        $filters->disable('tenant');
        try {
            return $fn();
        } finally {
            // getParameter renvoie la valeur deja quotee
            $filters->enable('tenant')->setParameter('company_id', trim($companyId, "'"));
        }
    }
}
