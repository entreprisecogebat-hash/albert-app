<?php

namespace App\Doctrine;

use App\Entity\TenantOwned;
use Doctrine\ORM\Mapping\ClassMetadata;
use Doctrine\ORM\Query\Filter\SQLFilter;

/**
 * Isolation multi-tenant : toute requete Doctrine sur une entite TenantOwned
 * est restreinte a l'entreprise de l'utilisateur connecte.
 * C'est un filet de securite en plus des controles d'acces par chantier.
 */
final class TenantFilter extends SQLFilter
{
    public function addFilterConstraint(ClassMetadata $targetEntity, string $targetTableAlias): string
    {
        if (!$targetEntity->reflClass?->implementsInterface(TenantOwned::class)) {
            return '';
        }
        if (!$targetEntity->hasAssociation('company')) {
            return '';
        }
        $column = $targetEntity->getSingleAssociationJoinColumnName('company');

        return sprintf('%s.%s = %s', $targetTableAlias, $column, $this->getParameter('company_id'));
    }
}
