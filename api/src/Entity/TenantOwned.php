<?php

namespace App\Entity;

/**
 * Toute donnee rattachee a une entreprise cliente.
 * Le filtre Doctrine App\Doctrine\TenantFilter restreint ces entites
 * a l'entreprise de l'utilisateur connecte, a chaque requete.
 */
interface TenantOwned
{
    public function getCompany(): Company;
}
