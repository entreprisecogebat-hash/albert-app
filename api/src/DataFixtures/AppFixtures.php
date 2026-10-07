<?php

namespace App\DataFixtures;

use App\Classification\TitleNormalizer;
use App\Controller\ClockController;
use App\Entity\ActivityEvent;
use App\Entity\Appointment;
use App\Entity\Channel;
use App\Entity\Company;
use App\Entity\Contact;
use App\Entity\Document;
use App\Entity\FinanceEntry;
use App\Entity\DocumentVersion;
use App\Entity\Folder;
use App\Entity\Intervention;
use App\Entity\Message;
use App\Entity\Photo;
use App\Entity\Reserve;
use App\Entity\ReserveEvent;
use App\Entity\ShareLink;
use App\Entity\Site;
use App\Entity\SiteMember;
use App\Entity\Task;
use App\Entity\TimeEntry;
use App\Entity\User;
use App\Service\ActivityRecorder;
use App\Service\CompanyProvisioner;
use App\Service\DoeService;
use App\Service\FinanceService;
use App\Service\InterventionService;
use App\Service\PhoneNumber;
use App\Service\SiteFactory;
use App\Storage\FileStorage;
use Doctrine\Bundle\FixturesBundle\Fixture;
use Doctrine\Persistence\ObjectManager;
use Symfony\Component\Uid\Uuid;

/**
 * Donnees de demonstration : deux entreprises du BTP francilien, Cogebat et Patenotte,
 * avec des chantiers aux trois temps du CDC (avant, pendant, apres) et tous les modules remplis :
 * documents versionnes, photos, messages, taches, agenda, pointages, fiches d'intervention signees,
 * reserves et SAV, contacts CRM, DOE. Les dates sont relatives au moment du chargement.
 *
 * Connexion (code SMS affiche a l'ecran en dev) :
 *   06 12 34 56 78  Karim Belhadi, conducteur de travaux, administrateur Cogebat
 *   06 22 33 44 55  Sophie Nadal, cheffe de chantier (tableau « Aujourd'hui » bien rempli)
 *   06 33 44 55 66  Mehdi Rahal, chef d'equipe etancheite
 *   06 44 55 66 77  Thomas Girard, macon
 *   06 45 56 67 78  Yanis Benali, plombier chauffagiste
 *   06 46 57 68 79  Lucas Moreau, electricien sous-traitant (Elec Services 92)
 *   06 98 76 54 32  Claire Lefevre, cliente de Villa Marceau
 *   06 77 88 99 00  Marc Dubreuil, SCI Les Tilleuls (client)
 *   06 11 22 33 44  Paul Garnier, client de la Maison Garnier (apres chantier, SAV)
 *   06 55 44 33 22  Julien Patenotte, administrateur Patenotte (autre entreprise, donnees isolees)
 *   06 56 67 78 89  Camille Roux, cheffe de chantier Patenotte
 */
final class AppFixtures extends Fixture
{
    private ObjectManager $om;
    private \DateTimeImmutable $now;
    /** Rien de ce qui s'est « produit » ne doit etre plus recent que cette limite (Villa Marceau reste en tete). */
    private \DateTimeImmutable $cap;
    private int $photoSeed = 0;

    public function __construct(
        private readonly CompanyProvisioner $provisioner,
        private readonly SiteFactory $sites,
        private readonly ActivityRecorder $activity,
        private readonly FileStorage $storage,
        private readonly InterventionService $interventions,
        private readonly DoeService $doe,
        private readonly FinanceService $finances,
    ) {}

    public function load(ObjectManager $manager): void
    {
        $this->om = $manager;
        $this->now = new \DateTimeImmutable();
        $this->cap = $this->now->modify('-30 minutes');

        $this->cogebat();
        $this->patenotte();
        $manager->flush();

        // Historique de demonstration : recu par le serveur au moment ou il s'est produit
        $conn = $manager->getConnection();
        // Chantier ouvert sans date de debut : ouvert juste avant sa premiere activite
        $conn->executeStatement("UPDATE activity_event e SET occurred_at = COALESCE((SELECT MIN(x.occurred_at) FROM activity_event x WHERE x.site_id = e.site_id AND x.type != 'site_created'), e.occurred_at) - INTERVAL '1 hour' WHERE e.type = 'site_created' AND e.occurred_at > NOW() - INTERVAL '1 hour'");
        $conn->executeStatement('UPDATE activity_event SET recorded_at = occurred_at');
        $conn->executeStatement('UPDATE site SET last_activity_at = (SELECT MAX(e.occurred_at) FROM activity_event e WHERE e.site_id = site.id)');
        // Nouveautes : Karim a regarde il y a 3 heures, Sophie hier soir, les clients avant-hier
        $conn->executeStatement("UPDATE site_member SET last_seen_at = NOW() - INTERVAL '3 hours' WHERE user_id = (SELECT id FROM app_user WHERE phone = '+33612345678')");
        $conn->executeStatement("UPDATE site_member SET last_seen_at = CURRENT_DATE - INTERVAL '1 day' + INTERVAL '18 hours' WHERE user_id = (SELECT id FROM app_user WHERE phone = '+33622334455')");
        $conn->executeStatement("UPDATE site_member SET last_seen_at = NOW() - INTERVAL '2 days' WHERE last_seen_at IS NULL");
    }

    // =====================================================================
    // Cogebat
    // =====================================================================

    private function cogebat(): void
    {
        $om = $this->om;
        $karim = $this->provisioner->create('Cogebat', 'cogebat', '+33612345678', 'Karim', 'Belhadi');
        $karim->setJobTitle('Conducteur de travaux');
        $co = $karim->getCompany();

        $sophie = $this->user($co, '+33622334455', 'Sophie', 'Nadal', 'Cheffe de chantier');
        $mehdi = $this->user($co, '+33633445566', 'Mehdi', 'Rahal', 'Chef d’équipe étanchéité');
        $thomas = $this->user($co, '+33644556677', 'Thomas', 'Girard', 'Maçon');
        $yanis = $this->user($co, '+33645566778', 'Yanis', 'Benali', 'Plombier chauffagiste');
        $lucas = $this->user($co, '+33646576879', 'Lucas', 'Moreau', 'Électricien, Élec Services 92 (sous-traitant)');
        $lefevre = $this->user($co, '+33698765432', 'Claire', 'Lefèvre', 'Maître d’ouvrage', User::KIND_CLIENT);
        $dubreuil = $this->user($co, '+33677889900', 'Marc', 'Dubreuil', 'SCI Les Tilleuls', User::KIND_CLIENT);
        $garnier = $this->user($co, '+33611223344', 'Paul', 'Garnier', 'Propriétaire', User::KIND_CLIENT);
        $om->flush();

        // ---------- Chantiers ----------
        $villa = $this->site($karim, 'Villa Marceau', '18 rue Marceau, Levallois-Perret', 'CGB-2026-014', 'Mme Lefèvre', '2026-05-04', 48.8946, 2.2874);
        $tilleuls = $this->site($karim, 'Résidence Les Tilleuls', '9 allée des Tilleuls, Clichy', 'CGB-2026-009', 'SCI Les Tilleuls', '2026-03-16', 48.9045, 2.3060);
        $voltaire = $this->site($karim, 'Bureaux Voltaire', '230 boulevard Voltaire, Paris 11e', 'CGB-2026-021', 'Voltaire Invest', '2026-09-01', 48.8556, 2.3897);
        $maisonG = $this->site($karim, 'Maison Garnier', '42 avenue Paul Doumer, Rueil-Malmaison', 'CGB-2025-031', 'M. et Mme Garnier', '2025-11-17', 48.8770, 2.1890);
        $maisonG->setPhase(Site::PHASE_AFTER);
        $maisonG->setDeliveredOn(new \DateTimeImmutable('2026-07-10'));
        $pharma = $this->site($karim, 'Pharmacie du Marché', '3 place Charras, Courbevoie', 'CGB-2025-018', 'Pharmacie du Marché', '2025-10-06', 48.8973, 2.2560);
        $pharma->setPhase(Site::PHASE_AFTER);
        $pharma->setDeliveredOn(new \DateTimeImmutable('2026-02-20'));
        $loft = $this->site($karim, 'Loft Saint-Ouen', '27 rue des Rosiers, Saint-Ouen-sur-Seine', 'CGB-2026-027', 'M. Mercier', null, 48.9110, 2.3330);
        $loft->setPhase(Site::PHASE_BEFORE);
        $om->flush();

        foreach ([$villa, $tilleuls, $voltaire, $maisonG, $loft] as $s) {
            $this->member($s, $sophie, SiteMember::ROLE_MANAGER);
        }
        foreach ([[$villa, $mehdi], [$tilleuls, $mehdi], [$maisonG, $mehdi], [$tilleuls, $thomas], [$voltaire, $thomas],
            [$villa, $thomas], [$voltaire, $yanis], [$villa, $yanis], [$maisonG, $yanis], [$voltaire, $lucas], [$pharma, $yanis]] as [$s, $u]) {
            $this->member($s, $u, SiteMember::ROLE_WORKER);
        }
        $this->member($villa, $lefevre, SiteMember::ROLE_CLIENT);
        $this->member($tilleuls, $dubreuil, SiteMember::ROLE_CLIENT);
        $this->member($maisonG, $garnier, SiteMember::ROLE_CLIENT);
        $om->flush();

        // ---------- Contacts CRM ----------
        $cMercier = $this->contact($co, 'prospect', 'Antoine Mercier', null, 'Particulier', '06 71 24 38 90', 'antoine.mercier@gmail.com', '27 rue des Rosiers, 93400 Saint-Ouen-sur-Seine', 'Rénovation complète d’un loft de 140 m² (ancien atelier). Budget annoncé 180 k€. Souhaite démarrer en janvier.', [$loft]);
        $cHaddad = $this->contact($co, 'prospect', 'Nadia Haddad', null, 'Particulier', '06 62 18 44 07', 'n.haddad@outlook.fr', '15 rue de la République, 92800 Puteaux', 'Cuisine et salle de bain, appartement 3 pièces. Rappeler après le 15.', []);
        $cHabitat = $this->contact($co, 'prospect', 'Julie Caron', 'Habitat Plus Promotion', 'Responsable programmes', '01 47 58 21 90', 'j.caron@habitatplus.fr', '8 rue Anatole France, 92300 Levallois-Perret', 'Appel d’offres gros œuvre pour 12 logements à Bezons. Remise des offres fin octobre.', []);
        $cLefevre = $this->contact($co, 'client', 'Claire Lefèvre', null, 'Maître d’ouvrage', '06 98 76 54 32', 'claire.lefevre@free.fr', '18 rue Marceau, 92300 Levallois-Perret', null, [$villa]);
        $cDubreuil = $this->contact($co, 'client', 'Marc Dubreuil', 'SCI Les Tilleuls', 'Gérant', '06 77 88 99 00', 'm.dubreuil@sci-tilleuls.fr', '9 allée des Tilleuls, 92110 Clichy', null, [$tilleuls]);
        $cChen = $this->contact($co, 'client', 'Olivier Chen', 'Voltaire Invest', 'Directeur immobilier', '01 43 79 52 10', 'o.chen@voltaire-invest.com', '230 boulevard Voltaire, 75011 Paris', 'Interlocuteur unique pour les avenants. Copie systématique à la comptabilité.', [$voltaire]);
        $cGarnier = $this->contact($co, 'client', 'Paul et Hélène Garnier', null, 'Particuliers', '06 11 22 33 44', 'garnier.famille@orange.fr', '42 avenue Paul Doumer, 92500 Rueil-Malmaison', 'Extension de 35 m² livrée le 10 juillet 2026.', [$maisonG]);
        $cPharma = $this->contact($co, 'client', 'Dr Sarah Benoît', 'Pharmacie du Marché', 'Pharmacienne titulaire', '01 43 33 12 87', 'contact@pharmaciedumarche-courbevoie.fr', '3 place Charras, 92400 Courbevoie', null, [$pharma]);
        $cPointP = $this->contact($co, 'fournisseur', 'Agence Point.P Levallois', 'Point.P', 'Comptoir', '01 41 05 62 00', 'levallois@pointp.fr', '120 rue Aristide Briand, 92300 Levallois-Perret', 'Compte pro n° 4471-208. Livraison chantier sous 48 h.', [$villa, $tilleuls]);
        $cLM = $this->contact($co, 'fournisseur', 'Leroy Merlin Pro Nanterre', 'Leroy Merlin', 'Service pro', '01 55 69 30 00', null, '2 avenue de la Commune de Paris, 92000 Nanterre', null, [$voltaire]);
        $cLorin = $this->contact($co, 'fournisseur', 'Stéphane Lorin', 'Menuiseries Lorin', 'Commercial', '06 30 41 87 22', 's.lorin@menuiseries-lorin.fr', 'ZA des Bruyères, 95100 Argenteuil', 'Menuiseries alu Villa Marceau : livraison décalée, nouvelle date confirmée par écrit.', [$villa]);
        $cKiloutou = $this->contact($co, 'fournisseur', 'Kiloutou Clichy', 'Kiloutou', 'Agence', '01 47 37 18 40', 'clichy@kiloutou.fr', '61 rue Martre, 92110 Clichy', 'Échafaudage façade Tilleuls loué jusqu’au 31 octobre.', [$tilleuls]);
        $cFabre = $this->contact($co, 'partenaire', 'Laure Fabre', 'Atelier Fabre Architectes', 'Architecte DPLG', '06 84 12 55 31', 'laure@atelierfabre.fr', '14 rue de Lévis, 75017 Paris', 'Maître d’œuvre Villa Marceau et Maison Garnier.', [$villa, $maisonG]);
        $cBet = $this->contact($co, 'partenaire', 'Nicolas Perrin', 'BET Structure Ingénierie', 'Ingénieur structure', '01 46 21 77 05', 'n.perrin@bet-si.fr', '5 rue Gambetta, 92100 Boulogne-Billancourt', 'Notes de calcul trémie et reprise en sous-œuvre.', [$tilleuls, $loft]);
        $cToitec = $this->contact($co, 'sous_traitant', 'Toitec Étanchéité', 'Toitec', 'Bureau', '01 39 80 44 12', 'devis@toitec.fr', '18 rue de l’Industrie, 95870 Bezons', 'Sous-traitant étanchéité toitures-terrasses. Attestation décennale 2026 reçue.', [$villa]);
        $cElec = $this->contact($co, 'sous_traitant', 'Lucas Moreau', 'Élec Services 92', 'Gérant', '06 46 57 68 79', 'contact@elecservices92.fr', '22 rue Victor Hugo, 92270 Bois-Colombes', 'Lot électricité Bureaux Voltaire.', [$voltaire]);
        $om->flush();

        // =================================================================
        // Villa Marceau : l'histoire des maquettes, plus tous les modules
        // =================================================================
        $plan = $this->document($villa, 'plans', 'Plan de calepinage', 'plan', $sophie, 'Plan_calepinage_v1.pdf', new \DateTimeImmutable('2026-08-12 10:30'), 'V1', Document::VISIBILITY_CLIENT, $cFabre);
        $this->version($plan, $karim, 'Plan_calepinage_v2.pdf', new \DateTimeImmutable('2026-09-03 16:02'), 'V2', 'Mise à jour après la visite de l’architecte.');
        $this->document($villa, 'plans', 'Plan des réseaux RDC', 'plan', $sophie, 'Plan_reseaux_RDC_indB.pdf', $this->t('-20 days 08:45'), 'Ind. B', Document::VISIBILITY_TEAM, $cFabre);
        $this->document($villa, 'pv', 'Compte rendu de chantier n°12', 'pv', $karim, 'CR_chantier_12.pdf', $this->t('-6 days 18:10'), 'V1', Document::VISIBILITY_CLIENT);
        $this->document($villa, 'pv', 'Compte rendu de chantier n°11', 'pv', $karim, 'CR_chantier_11.pdf', $this->t('-13 days 18:05'), 'V1', Document::VISIBILITY_CLIENT);
        $this->document($villa, 'administratif', 'CCTP lot 03 étanchéité', 'administratif', $karim, 'CCTP_lot03_etancheite.pdf', new \DateTimeImmutable('2026-04-22 09:00'), 'V1', Document::VISIBILITY_TEAM, $cFabre);
        $this->document($villa, 'administratif', 'Attestation décennale Toitec 2026', 'administratif', $karim, 'Attestation_decennale_Toitec_2026.pdf', new \DateTimeImmutable('2026-05-02 11:12'), 'V1', Document::VISIBILITY_TEAM, $cToitec);
        $menuis = $this->document($villa, 'devis', 'Devis menuiseries aluminium', 'devis', $karim, 'Devis_menuiseries_Lorin_v1.pdf', new \DateTimeImmutable('2026-05-28 14:00'), 'V1', Document::VISIBILITY_TEAM, $cLorin);
        $this->version($menuis, $karim, 'Devis_menuiseries_Lorin_v2.pdf', new \DateTimeImmutable('2026-06-09 10:20'), 'V2', 'Ajout de la baie coulissante séjour.');
        $this->document($villa, 'factures', 'Facture Point.P n°FA-26-08812', 'facture', $sophie, 'Facture_PointP_FA-26-08812.pdf', $this->t('-9 days 16:40'), 'V1', Document::VISIBILITY_TEAM, $cPointP);
        $this->document($villa, 'factures', 'Situation de travaux n°4', 'facture', $karim, 'Situation_04_Villa_Marceau.pdf', $this->t('-4 days 17:30'), 'V1', Document::VISIBILITY_CLIENT, $cLefevre);
        $this->document($villa, 'administratif', 'Planning travaux', 'administratif', $sophie, 'Planning_Villa_Marceau_S41.pdf', $this->t('-3 days 08:15'), 'S41', Document::VISIBILITY_CLIENT);

        $this->activity->record(
            $villa, ActivityEvent::NOTE, $karim, 'Réception du chantier reportée au 22 octobre', 'Décalage lié à la livraison des menuiseries.',
            [], Document::VISIBILITY_CLIENT, $this->t('-1 days 9:15'),
        );

        $ch = $this->channels($villa);
        $this->conversation($ch['internal'], [
            [$sophie, 'Bonjour à tous. Point de la semaine : étanchéité terrasse, menuiseries, puis cloisons étage.', '-6 days 7:45'],
            [$mehdi, 'Le primaire est passé sur la terrasse, on attaque la membrane demain si la météo tient.', '-6 days 16:30'],
            [$karim, 'Attention à la météo jeudi, 80 % de pluie annoncée. Bâchez le soir.', '-5 days 8:10'],
            [$mehdi, 'Bâché. Il manque 2 rouleaux de membrane, je passe chez Point.P demain matin.', '-5 days 17:42'],
            [$sophie, 'Commande passée, livraison chantier jeudi 7h. Bon de livraison dans le dossier factures.', '-4 days 9:05'],
            [$thomas, 'Réservation de la trémie escalier : il faut le plan de l’archi en indice C avant de couler.', '-4 days 11:20'],
            [$sophie, 'Je relance l’atelier Fabre. En attendant on ne coule pas.', '-4 days 11:31'],
            [$yanis, 'Les attentes EU/EV de la salle de bain étage sont posées. Photos dans le fil.', '-3 days 15:48'],
            [$karim, 'Menuiseries Lorin : livraison repoussée à jeudi prochain, je préviens la cliente.', '-3 days 18:02'],
            [$mehdi, 'Relevés d’étanchéité terminés côté nord. Reste l’angle sud-est.', '-2 days 16:55'],
            [$sophie, 'Les menuiseries arrivent jeudi matin. Quelqu’un peut réceptionner à 8h ?', '-2 days 17:02'],
            [$mehdi, 'Oui, je serai sur place.', '-2 days 17:20'],
            [$yanis, 'Il faudra couper l’eau 2 h mardi pour raccorder la colonne. Je préviens la cliente ?', '-1 days 10:14'],
            [$sophie, 'Oui, propose-lui mardi 8h-10h. Et pense à la fiche d’intervention.', '-1 days 10:30'],
            [$thomas, 'Plan indice C reçu ? Je peux préparer le coffrage demain ?', '-1 days 16:12'],
        ]);
        $this->conversation($ch['client'], [
            [$karim, 'Bonjour Madame Lefèvre, voici le planning de la semaine : étanchéité de la terrasse puis pose des menuiseries.', '-8 days 9:00'],
            [$lefevre, 'Merci. Pouvez-vous me confirmer la teinte des menuiseries ? Gris anthracite 7016 ?', '-8 days 12:41'],
            [$karim, 'Oui, RAL 7016 finition sablée, comme sur le devis signé.', '-8 days 13:05'],
            [$lefevre, 'Parfait. Mon voisin se plaint du bruit le samedi matin, c’est prévu ?', '-6 days 19:10'],
            [$sophie, 'Pas de travaux le samedi, c’était une livraison exceptionnelle. Toutes nos excuses à votre voisin.', '-5 days 8:20'],
            [$karim, 'La livraison des menuiseries est décalée à jeudi prochain par le fournisseur. La réception est donc reportée au 22 octobre.', '-3 days 18:10'],
            [$lefevre, 'C’est ennuyeux, nous avions prévu le déménagement le 25. Ça tient toujours ?', '-3 days 20:02'],
            [$karim, 'Oui, le 22 laisse 3 jours de marge. Je vous confirme dès que les menuiseries sont posées.', '-2 days 8:05'],
            [$karim, 'Bonjour Madame Lefèvre, la reprise de l’étanchéité de la terrasse commence demain.', '-2 days 11:00'],
            [$lefevre, 'Est-ce qu’on tient toujours la livraison du 15 ?', '-1 days 17:24'],
        ]);

        $this->document($villa, 'devis', 'Devis étanchéité Toitec', 'devis', $karim, 'DEVIS_etancheite_Toitec.pdf', $this->now->modify('-2 hours'), 'V1', Document::VISIBILITY_TEAM, $cToitec);

        $before = $this->photoBatch($villa, $sophie, $this->t('-12 days 9:10'), 3, 'État de la terrasse avant reprise', Document::VISIBILITY_CLIENT);
        // Les photos de la maquette : il y a 12 minutes, Villa Marceau en tete de « Mes chantiers »
        $this->photoBatch($villa, $sophie, $this->now->modify('-17 minutes'), 4, 'Reprise de l’étanchéité terrasse', Document::VISIBILITY_CLIENT);
        $this->photoBatch($villa, $yanis, $this->t('-3 days 15:40'), 2, 'Attentes EU/EV salle de bain étage', Document::VISIBILITY_TEAM);
        $this->photoBatch($villa, $mehdi, $this->t('-2 days 16:40'), 3, 'Relevés d’étanchéité côté nord', Document::VISIBILITY_TEAM);

        // Taches
        $this->task($villa, 'Relancer l’atelier Fabre pour le plan trémie indice C', $sophie, $sophie, '-2 days', 'urgent');
        $this->task($villa, 'Réceptionner les menuiseries Lorin (8h)', $sophie, $mehdi, '+2 days');
        $this->task($villa, 'Confirmer la coupure d’eau de mardi à Mme Lefèvre', $sophie, $sophie, 'today', 'urgent');
        $this->task($villa, 'Commander 2 rouleaux de membrane SBS', $sophie, $mehdi, '-5 days', 'normal', '-5 days 9:00');
        $this->task($villa, 'Bâcher la terrasse avant la pluie', $karim, $mehdi, '-5 days', 'urgent', '-5 days 17:40');
        $this->task($villa, 'Préparer la situation de travaux n°5', $karim, $sophie, '+6 days');
        $this->task($villa, 'Vérifier les attentes électriques cuisine avec Élec Services', $sophie, null, '+3 days');

        // Interventions
        $fi = $this->intervention($villa, $mehdi, '-9 days', 'Reprise d’étanchéité terrasse, zone nord',
            "Dépose de l’ancienne membrane sur 18 m².\nApplication du primaire d’accrochage.\nPose de la membrane SBS bicouche et des relevés côté nord.",
            "Membrane SBS 2 rouleaux, primaire 10 L, bandes de solin alu 6 ml", 420, 'Mehdi Rahal, Thomas Girard', 'Claire Lefèvre');
        $this->intervention($villa, $yanis, '-3 days', 'Attentes plomberie salle de bain étage',
            "Création des attentes EU/EV et alimentation PER de la salle de bain étage.\nEssai d’étanchéité des réseaux sous 6 bars pendant 2 h : conforme.",
            'Tube PER 16 et 20, collecteur 4 départs, PVC 40/100', 300, 'Yanis Benali', 'Claire Lefèvre');
        $this->intervention($villa, $mehdi, '-1 days', 'Relevés d’étanchéité et évacuation EP',
            "Reprise des relevés côté nord et pose d’une naissance EP diamètre 80.\nContrôle à l’eau : pas de fuite constatée.",
            'Naissance EP alu D80, membrane de relevé 4 ml', 360, 'Mehdi Rahal', null);

        // Reserves pre-reception
        $this->reserve($villa, 'reserve', 'Joint silicone de la douche à reprendre', 'Le joint en pied de receveur est décollé sur 30 cm.', 'Salle d’eau RDC', $sophie, '-4 days 10:00', Reserve::STATUS_OPEN, '+5 days', $yanis, Document::VISIBILITY_CLIENT, [], []);
        $this->reserve($villa, 'reserve', 'Éclat sur l’appui de fenêtre chambre 2', null, 'Chambre 2, étage', $lefevre, '-6 days 19:20', Reserve::STATUS_IN_PROGRESS, '-1 days', $thomas, Document::VISIBILITY_CLIENT, [], [[$sophie, null, 'Ragréage prévu, ponçage et peinture ensuite.', '-5 days 8:30']]);

        // =================================================================
        // Residence Les Tilleuls : ravalement et renovation des parties communes
        // =================================================================
        $this->document($tilleuls, 'plans', 'Plan de façade nord', 'plan', $sophie, 'Plan_facade_nord_v4.pdf', $this->t('-9 days 14:00'), 'V4', Document::VISIBILITY_CLIENT);
        $this->document($tilleuls, 'plans', 'Plan de façade sud', 'plan', $sophie, 'Plan_facade_sud_v2.pdf', $this->t('-24 days 10:15'), 'V2', Document::VISIBILITY_CLIENT);
        $rav = $this->document($tilleuls, 'devis', 'Devis ravalement façades', 'devis', $karim, 'Devis_ravalement_v1.pdf', new \DateTimeImmutable('2026-02-10 15:00'), 'V1', Document::VISIBILITY_CLIENT, $cDubreuil);
        $this->version($rav, $karim, 'Devis_ravalement_v2.pdf', new \DateTimeImmutable('2026-02-27 11:30'), 'V2', 'Option isolation par l’extérieur pignon est.');
        $this->document($tilleuls, 'factures', 'Situation de travaux n°3', 'facture', $karim, 'Situation_03_Tilleuls.pdf', $this->t('-11 days 18:00'), 'V1', Document::VISIBILITY_CLIENT, $cDubreuil);
        $this->document($tilleuls, 'factures', 'Facture Kiloutou échafaudage septembre', 'facture', $sophie, 'Kiloutou_F2609-5521.pdf', $this->t('-15 days 9:30'), 'V1', Document::VISIBILITY_TEAM, $cKiloutou);
        $this->document($tilleuls, 'pv', 'Compte rendu de chantier n°7', 'pv', $sophie, 'CR_Tilleuls_07.pdf', $this->t('-7 days 17:45'), 'V1', Document::VISIBILITY_CLIENT);
        $this->document($tilleuls, 'administratif', 'Repérage amiante avant travaux', 'administratif', $karim, 'RAAT_Tilleuls.pdf', new \DateTimeImmutable('2026-03-02 10:00'), 'V1', Document::VISIBILITY_TEAM);
        $this->document($tilleuls, 'administratif', 'Note de calcul linteau hall', 'administratif', $karim, 'NDC_linteau_hall_BET-SI.pdf', $this->t('-18 days 14:20'), 'V1', Document::VISIBILITY_TEAM, $cBet);
        $chT = $this->channels($tilleuls);
        $this->conversation($chT['internal'], [
            [$sophie, 'Échafaudage façade nord monté. Thomas, tu peux démarrer le piquage des enduits.', '-10 days 7:50'],
            [$thomas, 'Démarré. Enduit très friable sur le 3e étage, il faudra plus de mortier que prévu.', '-10 days 15:30'],
            [$sophie, 'Ok, je fais un avenant. Prends des photos pour justifier.', '-10 days 15:45'],
            [$mehdi, 'Les couvertines de l’acrotère sont à changer, elles sont percées à 3 endroits.', '-8 days 11:02'],
            [$karim, 'On l’ajoute au devis complémentaire. Ne touchez à rien avant accord de la SCI.', '-8 days 12:15'],
            [$thomas, 'Façade nord : enduit de corps terminé. Finition grattée la semaine prochaine.', '-3 days 17:05'],
            [$sophie, 'Le loueur passe vérifier l’échafaudage jeudi. Rangez les planchers.', '-2 days 8:40'],
            [$thomas, 'Rangé. Il faudra 2 sacs de plus de finition ton pierre.', '-1 days 16:50'],
        ]);
        $this->conversation($chT['client'], [
            [$sophie, 'Bonjour M. Dubreuil, le piquage de la façade nord a révélé un enduit très dégradé au 3e. Photos jointes dans le fil.', '-10 days 16:00'],
            [$dubreuil, 'Merci. Quel surcoût faut-il prévoir ?', '-10 days 18:22'],
            [$karim, 'Environ 2 400 € HT, devis complémentaire envoyé ce soir.', '-9 days 9:10'],
            [$dubreuil, 'Reçu, je le présente en AG lundi.', '-8 days 10:05'],
            [$dubreuil, 'Accord de l’AG pour le complément et les couvertines.', '-4 days 19:30'],
            [$sophie, 'Merci, nous commandons les couvertines cette semaine.', '-3 days 8:15'],
            [$dubreuil, 'Merci pour les photos. Je passe vendredi.', '-1 days 10:12'],
        ]);
        $this->photoBatch($tilleuls, $thomas, $this->t('-10 days 15:20'), 4, 'Enduit dégradé façade nord, 3e étage', Document::VISIBILITY_CLIENT);
        $this->photoBatch($tilleuls, $thomas, $this->t('-3 days 16:50'), 3, 'Enduit de corps terminé façade nord', Document::VISIBILITY_CLIENT);
        $this->task($tilleuls, 'Commander les couvertines alu (acrotère)', $karim, $sophie, '-1 days', 'urgent');
        $this->task($tilleuls, 'Préparer la visite de M. Dubreuil vendredi', $sophie, $sophie, '+3 days');
        $this->task($tilleuls, 'Commander 2 sacs de finition ton pierre', $sophie, $thomas, 'today');
        $this->task($tilleuls, 'Faire signer l’avenant n°2 par la SCI', $karim, $karim, '+2 days');
        $this->task($tilleuls, 'Rendre l’échafaudage façade sud', $sophie, null, '+12 days');
        $this->task($tilleuls, 'Envoyer le devis complémentaire', $karim, $karim, '-9 days', 'urgent', '-9 days 9:05');
        $this->intervention($tilleuls, $thomas, '-10 days', 'Piquage des enduits façade nord',
            "Piquage des enduits dégradés sur 140 m², façade nord, du RDC au R+3.\nÉvacuation des gravats en benne.", 'Benne 10 m³', 480, 'Thomas Girard, Mehdi Rahal', 'Marc Dubreuil');
        $this->intervention($tilleuls, $thomas, '-3 days', 'Enduit de corps façade nord',
            "Application de l’enduit de corps monocouche sur 140 m².\nProtection des menuiseries et des appuis.", 'Enduit monocouche 52 sacs', 450, 'Thomas Girard', 'Marc Dubreuil');
        $this->intervention($tilleuls, $mehdi, 'today', 'Remplacement des couvertines acrotère (partie 1)',
            "Dépose des couvertines percées sur 12 ml.\nPose provisoire d’un film de protection.", null, 180, 'Mehdi Rahal', null);
        $this->reserve($tilleuls, 'reserve', 'Fissure en pied de façade côté parking', 'Fissure horizontale de 2 m, à traiter avant la finition.', 'Façade nord, RDC', $sophie, '-5 days 11:00', Reserve::STATUS_OPEN, '+4 days', $thomas, Document::VISIBILITY_TEAM, [], []);

        // =================================================================
        // Bureaux Voltaire : amenagement de plateaux de bureaux
        // =================================================================
        $this->document($voltaire, 'devis', 'Devis plomberie', 'devis', $karim, 'Devis_plomberie_lot08.pdf', $this->t('-13 days 11:40'), 'V1', Document::VISIBILITY_TEAM);
        $this->document($voltaire, 'devis', 'Devis électricité courants forts et faibles', 'devis', $karim, 'Devis_elec_ElecServices92.pdf', new \DateTimeImmutable('2026-08-20 10:00'), 'V1', Document::VISIBILITY_TEAM, $cElec);
        $cloison = $this->document($voltaire, 'plans', 'Plan de cloisonnement R+2', 'plan', $sophie, 'Plan_cloisonnement_R2_indA.pdf', new \DateTimeImmutable('2026-08-28 09:00'), 'Ind. A', Document::VISIBILITY_CLIENT, $cChen);
        $this->version($cloison, $sophie, 'Plan_cloisonnement_R2_indB.pdf', $this->t('-17 days 14:30'), 'Ind. B', 'Salle de réunion agrandie.');
        $this->version($cloison, $karim, 'Plan_cloisonnement_R2_indC.pdf', $this->t('-5 days 10:05'), 'Ind. C', 'Ajout de deux bureaux fermés côté cour.');
        $this->document($voltaire, 'pv', 'Compte rendu de réunion n°3', 'pv', $sophie, 'CR_reunion_03_Voltaire.pdf', $this->t('-6 days 12:00'), 'V1', Document::VISIBILITY_CLIENT);
        $this->document($voltaire, 'administratif', 'Notice VMC double flux', 'administratif', $yanis, 'Notice_VMC_DF.pdf', $this->t('-12 days 8:30'), 'V1', Document::VISIBILITY_TEAM, $cLM);
        $this->document($voltaire, 'factures', 'Facture Leroy Merlin Pro n°88213', 'facture', $sophie, 'LMPro_88213.pdf', $this->t('-8 days 17:20'), 'V1', Document::VISIBILITY_TEAM, $cLM);
        $chV = $this->channels($voltaire);
        $this->conversation($chV['internal'], [
            [$sophie, 'Plan de cloisonnement indice C dans le dossier plans. Deux bureaux fermés en plus côté cour.', '-5 days 10:10'],
            [$thomas, 'Ok, je refais le traçage au sol demain matin.', '-5 days 11:00'],
            [$lucas, 'Il me faut l’implantation des postes de travail pour les nourrices au sol.', '-4 days 9:30'],
            [$sophie, 'Le client doit la valider jeudi en réunion. Je te l’envoie dans la foulée.', '-4 days 9:45'],
            [$yanis, 'Les réseaux de la kitchenette sont prêts pour l’essai.', '-2 days 15:20'],
            [$lucas, 'Tirage des câbles RJ45 terminé au R+2, 48 prises. Reste le brassage.', '-1 days 17:35'],
        ]);
        $this->conversation($chV['client'], [
            [$karim, 'Bonjour M. Chen, l’indice C du cloisonnement intègre les deux bureaux demandés. Merci de valider avant jeudi.', '-5 days 10:30'],
            [$karim, 'Pouvez-vous nous transmettre l’implantation des postes de travail ?', '-4 days 9:50'],
        ]);
        $this->photoBatch($voltaire, $thomas, $this->t('-4 days 8:20'), 3, 'Traçage des cloisons R+2', Document::VISIBILITY_CLIENT);
        $this->photoBatch($voltaire, $lucas, $this->t('-1 days 17:20'), 2, 'Baie de brassage R+2', Document::VISIBILITY_TEAM);
        $this->task($voltaire, 'Obtenir l’implantation des postes de travail', $sophie, $sophie, '-3 days', 'urgent');
        $this->task($voltaire, 'Essai d’étanchéité réseaux kitchenette', $sophie, $yanis, 'today');
        $this->task($voltaire, 'Réunion de chantier n°4 : préparer l’ordre du jour', $sophie, $sophie, 'today');
        $this->task($voltaire, 'Brassage baie informatique R+2', $sophie, $lucas, '+4 days');
        $this->task($voltaire, 'Commander les portes des bureaux côté cour', $karim, $karim, '+1 days');
        $this->task($voltaire, 'Tracer les cloisons indice C', $sophie, $thomas, '-4 days', 'normal', '-4 days 11:30');
        $this->intervention($voltaire, $lucas, '-1 days', 'Tirage des câbles courants faibles R+2',
            "Tirage de 48 câbles cat. 6A depuis la baie R+2.\nRepérage des prises et tests de continuité.", 'Câble cat. 6A 1 200 m, 48 prises RJ45', 480, 'Lucas Moreau', null);
        $this->intervention($voltaire, $yanis, '-6 days', 'Alimentations kitchenette',
            "Alimentations eau froide / eau chaude et évacuation de la kitchenette du R+2.", 'Multicouche 16, siphon, vannes', 240, 'Yanis Benali', 'Olivier Chen');

        // =================================================================
        // Maison Garnier : extension livree, reserves, SAV, garanties, DOE
        // =================================================================
        $this->document($maisonG, 'plans', 'Plans d’exécution extension', 'plan', $sophie, 'Plans_EXE_extension_indD.pdf', new \DateTimeImmutable('2026-01-12 10:00'), 'Ind. D', Document::VISIBILITY_CLIENT, $cFabre);
        $this->document($maisonG, 'devis', 'Devis extension 35 m²', 'devis', $karim, 'Devis_extension_Garnier_v3.pdf', new \DateTimeImmutable('2025-10-02 16:00'), 'V3', Document::VISIBILITY_CLIENT, $cGarnier);
        $this->document($maisonG, 'factures', 'Facture d’acompte 30 %', 'facture', $karim, 'Facture_acompte_Garnier.pdf', new \DateTimeImmutable('2025-11-10 09:00'), 'V1', Document::VISIBILITY_CLIENT, $cGarnier);
        $this->document($maisonG, 'factures', 'Facture de solde', 'facture', $karim, 'Facture_solde_Garnier.pdf', new \DateTimeImmutable('2026-07-24 11:00'), 'V1', Document::VISIBILITY_CLIENT, $cGarnier);
        $this->document($maisonG, 'pv', 'PV de réception avec réserves', 'pv', $karim, 'PV_reception_Garnier_2026-07-10.pdf', new \DateTimeImmutable('2026-07-10 17:30'), 'V1', Document::VISIBILITY_CLIENT, $cGarnier);
        $this->document($maisonG, 'administratif', 'Attestation d’assurance décennale Cogebat', 'administratif', $karim, 'Attestation_decennale_Cogebat_2026.pdf', new \DateTimeImmutable('2026-01-05 09:00'), 'V1', Document::VISIBILITY_CLIENT);
        $this->document($maisonG, 'administratif', 'Notice pompe à chaleur', 'administratif', $yanis, 'Notice_PAC_air_eau.pdf', new \DateTimeImmutable('2026-06-30 14:00'), 'V1', Document::VISIBILITY_CLIENT);
        $chG = $this->channels($maisonG);
        $this->conversation($chG['client'], [
            [$karim, 'Bonjour M. Garnier, voici le PV de réception signé et la liste des réserves. Nous intervenons sous 30 jours.', '2026-07-10 18:00'],
            [$garnier, 'Merci pour ce beau travail. La baie coulissante frotte un peu en fermeture.', '2026-07-20 10:12'],
            [$sophie, 'C’est noté en réserve, Mehdi passera la régler.', '2026-07-21 8:30'],
            [$garnier, 'Depuis les orages, une tache d’humidité apparaît sous la baie vitrée du séjour.', '-12 days 19:40'],
            [$sophie, 'Nous ouvrons une demande au titre de la garantie de parfait achèvement. Mehdi passe constater mardi.', '-11 days 8:45'],
            [$garnier, 'Merci. Le radiateur de la chambre ne chauffe pas non plus, c’est normal ?', '-2 days 20:15'],
        ]);
        $this->conversation($chG['internal'], [
            [$mehdi, 'Constat chez M. Garnier : infiltration au droit du seuil de la baie, le relevé d’étanchéité est trop court.', '-8 days 12:10'],
            [$karim, 'On reprend sous garantie. Commande d’une bande de relevé, intervention dès réception.', '-8 days 14:00'],
            [$yanis, 'Pour le radiateur, sûrement de l’air dans le circuit. Je peux passer jeudi.', '-1 days 9:00'],
        ]);
        $avant = $this->photoBatch($maisonG, $mehdi, $this->t('-8 days 11:50'), 3, 'Constat infiltration seuil baie séjour', Document::VISIBILITY_CLIENT);
        $this->photoBatch($maisonG, $sophie, new \DateTimeImmutable('2026-07-10 16:30'), 4, 'Réception de l’extension', Document::VISIBILITY_CLIENT);
        $this->intervention($maisonG, $mehdi, '2026-07-28', 'Levée des réserves de réception',
            "Réglage de la baie coulissante (galets et gâche).\nReprise de peinture de l’embrasure de la porte-fenêtre.\nNettoyage des traces de colle sur le carrelage.", null, 210, 'Mehdi Rahal', 'Paul Garnier');
        $this->intervention($maisonG, $yanis, '2026-08-04', 'Mise en service et réglage de la pompe à chaleur',
            "Contrôle de la pression du circuit, purge, réglage de la loi d’eau.\nExplication du thermostat aux occupants.", null, 120, 'Yanis Benali', 'Hélène Garnier');
        $this->reserve($maisonG, 'reserve', 'Baie coulissante qui frotte en fermeture', null, 'Séjour', $karim, '2026-07-10 17:00', Reserve::STATUS_DONE, '2026-08-09', $mehdi, Document::VISIBILITY_CLIENT, [], [[$mehdi, Reserve::STATUS_DONE, 'Galets et gâche réglés.', '2026-07-28 11:30']]);
        $this->reserve($maisonG, 'reserve', 'Reprise de peinture embrasure porte-fenêtre', null, 'Séjour', $karim, '2026-07-10 17:05', Reserve::STATUS_DONE, '2026-08-09', $mehdi, Document::VISIBILITY_CLIENT, [], [[$mehdi, Reserve::STATUS_DONE, 'Reprise faite, deux couches.', '2026-07-28 15:00']]);
        $this->reserve($maisonG, 'reserve', 'Traces de colle sur le carrelage de l’entrée', null, 'Entrée', $karim, '2026-07-10 17:10', Reserve::STATUS_DONE, '2026-08-09', $mehdi, Document::VISIBILITY_CLIENT, [], [[$mehdi, Reserve::STATUS_DONE, 'Nettoyé au décapant doux.', '2026-07-28 16:10']]);
        $this->reserve($maisonG, 'reserve', 'Plinthe décollée dans la chambre parentale', 'Plinthe bois décollée sur 1,20 m.', 'Chambre parentale', $karim, '2026-07-10 17:12', Reserve::STATUS_OPEN, '-6 days', $sophie, Document::VISIBILITY_CLIENT, [], [[$sophie, null, 'Plinthe commandée, pose à prévoir avec la reprise d’étanchéité.', '-10 days 9:00']]);
        $this->reserve($maisonG, 'garantie', 'Infiltration sous la baie vitrée du séjour', 'Tache d’humidité sous le seuil de la baie après les orages. Garantie de parfait achèvement.', 'Séjour, seuil de la baie', $garnier, '-12 days 19:45', Reserve::STATUS_IN_PROGRESS, '+3 days', $mehdi, Document::VISIBILITY_CLIENT, $avant,
            [[$sophie, null, 'Constat programmé mardi.', '-11 days 8:45'], [$mehdi, Reserve::STATUS_IN_PROGRESS, 'Relevé d’étanchéité trop court au droit du seuil. Bande de relevé commandée.', '-8 days 12:15']]);
        $this->reserve($maisonG, 'sav', 'Radiateur de la chambre qui ne chauffe pas', 'Le radiateur de la chambre 2 reste froid depuis la remise en route du chauffage.', 'Chambre 2', $garnier, '-2 days 20:20', Reserve::STATUS_OPEN, '+2 days', $yanis, Document::VISIBILITY_CLIENT, [], []);
        $this->task($maisonG, 'Poser la bande de relevé sous la baie (garantie)', $sophie, $mehdi, '+3 days', 'urgent');
        $this->task($maisonG, 'Purger le circuit de chauffage chambre 2', $sophie, $yanis, '+2 days');

        // =================================================================
        // Pharmacie du Marche : livree, une demande SAV en retard
        // =================================================================
        $this->document($pharma, 'pv', 'PV de réception', 'pv', $karim, 'PV_reception_Pharmacie_2026-02-20.pdf', new \DateTimeImmutable('2026-02-20 18:00'), 'V1', Document::VISIBILITY_CLIENT, $cPharma);
        $this->document($pharma, 'factures', 'Facture de solde', 'facture', $karim, 'Facture_solde_Pharmacie.pdf', new \DateTimeImmutable('2026-03-05 10:00'), 'V1', Document::VISIBILITY_CLIENT, $cPharma);
        $this->document($pharma, 'administratif', 'Notice porte automatique', 'administratif', $karim, 'Notice_porte_auto_Record.pdf', new \DateTimeImmutable('2026-02-20 17:00'), 'V1', Document::VISIBILITY_CLIENT);
        $this->reserve($pharma, 'sav', 'Porte automatique qui se bloque en ouverture', 'Bloquée ouverte deux fois cette semaine, le capteur semble déréglé.', 'Entrée', $karim, '-9 days 9:30', Reserve::STATUS_OPEN, '-2 days', $karim, Document::VISIBILITY_CLIENT, [], [[$karim, null, 'Appel au fabricant, technicien à programmer.', '-8 days 14:00']]);
        $this->reserve($pharma, 'garantie', 'Faïence fissurée derrière le comptoir', null, 'Comptoir', $karim, '2026-05-14 11:00', Reserve::STATUS_DONE, '2026-06-01', $thomas, Document::VISIBILITY_CLIENT, [], [[$thomas, Reserve::STATUS_DONE, 'Trois carreaux remplacés.', '2026-05-27 10:00']]);

        // =================================================================
        // Loft Saint-Ouen : avant chantier (prospect, metre, devis)
        // =================================================================
        $this->document($loft, 'plans', 'Relevé de l’existant', 'plan', $sophie, 'Releve_existant_loft.pdf', $this->t('-15 days 16:00'), 'V1', Document::VISIBILITY_TEAM, $cMercier);
        $dl = $this->document($loft, 'devis', 'Devis rénovation loft', 'devis', $karim, 'Devis_renovation_loft_v1.pdf', $this->t('-10 days 18:30'), 'V1', Document::VISIBILITY_TEAM, $cMercier);
        $this->version($dl, $karim, 'Devis_renovation_loft_v2.pdf', $this->t('-3 days 19:00'), 'V2', 'Variante avec mezzanine acier.');
        $this->document($loft, 'administratif', 'Étude de faisabilité mezzanine', 'administratif', $karim, 'Faisabilite_mezzanine_BET-SI.pdf', $this->t('-6 days 11:00'), 'V1', Document::VISIBILITY_TEAM, $cBet);
        $this->photoBatch($loft, $sophie, $this->t('-15 days 15:10'), 4, 'État des lieux avant travaux', Document::VISIBILITY_TEAM);
        $this->task($loft, 'Relancer M. Mercier sur le devis V2', $karim, $karim, 'today');
        $this->task($loft, 'Demander l’étude de sol au BET', $karim, $sophie, '+5 days');

        // ---------- Agenda (deux semaines, aujourd'hui compris) ----------
        $this->appointment($co, 'Réunion de chantier hebdomadaire', 'today 10:00', 'today 11:00', $villa, $cFabre, null, $sophie, 'Ordre du jour : menuiseries, trémie escalier, planning de réception.');
        $this->appointment($co, 'Visite de métré complémentaire', 'today 14:30', 'today 15:30', $loft, $cMercier, null, $karim, 'Mesurer la hauteur sous poutre pour la mezzanine.');
        $this->appointment($co, 'Coupure d’eau et raccordement colonne', '+1 days 8:00', '+1 days 10:00', $villa, $cLefevre, null, $yanis, null);
        $this->appointment($co, 'Livraison des menuiseries Lorin', '+2 days 8:00', '+2 days 9:00', $villa, $cLorin, null, $sophie, 'Prévoir 2 personnes pour le déchargement.');
        $this->appointment($co, 'Réunion de chantier n°4', '+2 days 14:00', '+2 days 15:30', $voltaire, $cChen, null, $sophie, 'Validation de l’implantation des postes.');
        $this->appointment($co, 'Visite de M. Dubreuil', '+3 days 11:00', '+3 days 12:00', $tilleuls, $cDubreuil, null, $sophie, null);
        $this->appointment($co, 'Intervention garantie : relevé sous la baie', '+3 days 9:00', '+3 days 12:00', $maisonG, $cGarnier, null, $mehdi, null);
        $this->appointment($co, 'Rendez-vous découverte cuisine et salle de bain', '+4 days 18:00', '+4 days 19:00', null, $cHaddad, '15 rue de la République, Puteaux', $karim, null);
        $this->appointment($co, 'Contrôle de l’échafaudage', '+6 days 9:00', null, $tilleuls, $cKiloutou, null, $sophie, null);
        $this->appointment($co, 'Remise d’offre Habitat Plus (Bezons)', '+8 days 15:00', '+8 days 16:00', null, $cHabitat, '8 rue Anatole France, Levallois-Perret', $karim, null);
        $this->appointment($co, 'Pré-réception avec l’architecte', '+13 days 10:00', '+13 days 12:00', $villa, $cFabre, null, $karim, null);
        $this->appointment($co, 'Réunion de chantier hebdomadaire', '-7 days 10:00', '-7 days 11:00', $villa, $cFabre, null, $sophie, null);

        // ---------- Pointages de la semaine ----------
        $this->week($sophie, [$villa, $tilleuls, $voltaire], '7:55', '17:20');
        $this->week($mehdi, [$villa, $tilleuls], '7:30', '16:30');
        $this->week($thomas, [$tilleuls, $voltaire], '7:20', '16:15');
        $this->week($yanis, [$voltaire, $villa], '8:00', '17:00');
        $this->week($lucas, [$voltaire], '8:15', '17:30');
        // Aujourd'hui : arrivees du matin, pointages en cours
        $this->clockToday($sophie, $villa, '8:10', 15);
        $this->clockToday($mehdi, $tilleuls, '7:35', 8);
        $this->clockToday($thomas, $tilleuls, '7:25', 22);
        $this->clockToday($yanis, $voltaire, '8:05', 40);
        $this->clockToday($lucas, $voltaire, '8:20', 1300);

        $this->om->flush();

        // ---------- Finances : devis, factures, depenses ----------
        $this->cogebatFinances($karim, $sophie,
            ['villa' => $villa, 'tilleuls' => $tilleuls, 'voltaire' => $voltaire, 'garnier' => $maisonG, 'pharma' => $pharma, 'loft' => $loft],
            ['lefevre' => $cLefevre, 'dubreuil' => $cDubreuil, 'chen' => $cChen, 'garnier' => $cGarnier, 'pharma' => $cPharma, 'mercier' => $cMercier,
                'pointp' => $cPointP, 'lm' => $cLM, 'lorin' => $cLorin, 'kiloutou' => $cKiloutou, 'toitec' => $cToitec, 'elec' => $cElec]);
        $this->om->flush();

        // ---------- DOE de la Maison Garnier, transmis aux proprietaires ----------
        $doeDoc = $this->doe->generate($maisonG, $karim, $this->t('-5 days 17:00'));
        $this->om->flush();
        $share = new ShareLink($doeDoc, 30, $karim);
        $this->om->persist($share);
        $this->activity->record($maisonG, ActivityEvent::SHARE_CREATED, $karim, 'Lien de partage : '.$doeDoc->getTitle(),
            'Valable 30 jours.', ['documentId' => (string) $doeDoc->getId()], Document::VISIBILITY_TEAM, $this->t('-5 days 17:05'));
        $maisonG->touchActivity($this->t('-5 days 17:05'));

        // Lien de partage du plan de calepinage envoye a l'architecte
        $planShare = new ShareLink($plan, 7, $karim);
        $this->om->persist($planShare);
    }

    // =====================================================================
    // Patenotte : seconde entreprise, donnees cloisonnees
    // =====================================================================

    private function patenotte(): void
    {
        $julien = $this->provisioner->create('Patenotte', 'patenotte', '+33655443322', 'Julien', 'Patenotte');
        $julien->setJobTitle('Gérant');
        $co = $julien->getCompany();
        $camille = $this->user($co, '+33656677889', 'Camille', 'Roux', 'Cheffe de chantier');
        $hugo = $this->user($co, '+33657788990', 'Hugo', 'Petit', 'Menuisier agenceur');
        $this->om->flush();

        $atelier = $this->site($julien, 'Atelier Oberkampf', '112 rue Oberkampf, Paris 11e', 'PAT-26-03', 'Studio Graphique Oberkampf', '2026-09-14', 48.8650, 2.3790);
        $bastille = $this->site($julien, 'Appartement Bastille', '6 rue de la Roquette, Paris 11e', 'PAT-26-05', 'Mme Nguyen', '2026-09-28', 48.8540, 2.3720);
        $charonne = $this->site($julien, 'Boutique Charonne', '81 rue de Charonne, Paris 11e', 'PAT-26-07', 'Maison Lune', null, 48.8540, 2.3820);
        $charonne->setPhase(Site::PHASE_BEFORE);
        $this->om->flush();
        foreach ([$atelier, $bastille, $charonne] as $s) {
            $this->member($s, $camille, SiteMember::ROLE_MANAGER);
        }
        $this->member($atelier, $hugo, SiteMember::ROLE_WORKER);
        $this->member($bastille, $hugo, SiteMember::ROLE_WORKER);
        $this->om->flush();

        $cStudio = $this->contact($co, 'client', 'Léa Martin', 'Studio Graphique Oberkampf', 'Associée', '06 20 33 44 55', 'lea@studio-oberkampf.fr', '112 rue Oberkampf, 75011 Paris', null, [$atelier]);
        $cNguyen = $this->contact($co, 'client', 'Mai Nguyen', null, 'Particulier', '06 27 81 90 12', 'mai.nguyen@gmail.com', '6 rue de la Roquette, 75011 Paris', null, [$bastille]);
        $cLune = $this->contact($co, 'prospect', 'Inès Lune', 'Maison Lune', 'Fondatrice', '06 51 42 63 74', 'ines@maisonlune.fr', '81 rue de Charonne, 75011 Paris', 'Agencement boutique de 60 m², ouverture visée en février.', [$charonne]);
        $this->contact($co, 'fournisseur', 'Bois et Matériaux Paris Est', 'BMPE', 'Comptoir', '01 43 70 11 22', 'comptoir@bmpe.fr', '14 rue de Montreuil, 75011 Paris', null, [$atelier, $bastille]);

        $this->document($atelier, 'devis', 'Devis menuiserie', 'devis', $julien, 'Devis_menuiserie.pdf', $this->t('-3 days 10:00'), 'V1', Document::VISIBILITY_TEAM, $cStudio);
        $this->document($atelier, 'plans', 'Plan d’agencement mezzanine', 'plan', $camille, 'Plan_agencement_mezzanine_v2.pdf', $this->t('-8 days 15:00'), 'V2', Document::VISIBILITY_CLIENT, $cStudio);
        $this->document($bastille, 'devis', 'Devis cuisine sur mesure', 'devis', $julien, 'Devis_cuisine_Nguyen.pdf', $this->t('-20 days 11:00'), 'V1', Document::VISIBILITY_CLIENT, $cNguyen);
        $this->document($charonne, 'devis', 'Devis agencement boutique', 'devis', $julien, 'Devis_agencement_MaisonLune_v1.pdf', $this->t('-4 days 18:00'), 'V1', Document::VISIBILITY_TEAM, $cLune);
        $ch = $this->channels($atelier);
        $this->conversation($ch['internal'], [
            [$camille, 'Les panneaux de chêne arrivent mercredi.', '-2 days 9:00'],
            [$hugo, 'Je prépare les tasseaux de la mezzanine en attendant.', '-2 days 9:20'],
            [$camille, 'Pense à photographier les fixations avant de fermer.', '-1 days 8:30'],
        ]);
        $this->photoBatch($atelier, $hugo, $this->t('-1 days 15:00'), 2, 'Structure de la mezzanine', Document::VISIBILITY_TEAM);
        $this->task($atelier, 'Réceptionner les panneaux de chêne', $camille, $hugo, '+1 days');
        $this->task($atelier, 'Valider la teinte du vernis avec le client', $camille, $camille, 'today');
        $this->task($bastille, 'Prise de cotes définitives cuisine', $camille, $hugo, '-1 days', 'urgent');
        $this->task($charonne, 'Relancer Maison Lune sur le devis', $julien, $julien, '+2 days');
        $this->intervention($atelier, $hugo, '-2 days', 'Pose de l’ossature de la mezzanine', "Pose des solives et du chevêtre, contrôle de niveau.", 'Solives douglas 8 pièces, sabots', 360, 'Hugo Petit', 'Léa Martin');
        $this->appointment($co, 'Présentation des échantillons', 'today 16:00', 'today 17:00', $charonne, $cLune, null, $julien, null);
        $this->appointment($co, 'Réception des panneaux', '+1 days 8:30', null, $atelier, null, null, $camille, null);
        $this->week($hugo, [$atelier, $bastille], '8:00', '17:00');
        $this->om->flush();

        // Finances Patenotte
        $q = $this->quote($atelier, $julien, 'Agencement mezzanine et bibliothèque chêne', 3_840_000, 2000, $cStudio, '-40 days', 'accepted', '-33 days', $this->doc($atelier, 'Devis menuiserie'));
        $this->bill($q, $julien, 30, '-30 days', '-5 days', []);
        $this->expense($atelier, $camille, 'Panneaux chêne massif et quincaillerie', 'materiaux', 920_000, 2000, null, 'BMPE-26-1182', '-3 days', '+12 days', false);
        $q = $this->quote($bastille, $julien, 'Cuisine sur mesure', 2_790_000, 1000, $cNguyen, '-25 days', 'accepted', '-21 days', $this->doc($bastille, 'Devis cuisine sur mesure'));
        $this->bill($q, $julien, 40, '-20 days', '+10 days', [['-15 days', 'all', 'virement']]);
        $this->quote($charonne, $julien, 'Agencement boutique 60 m²', 5_200_000, 2000, $cLune, '-4 days', 'sent', null, $this->doc($charonne, 'Devis agencement boutique'));
        $this->issueBills();
    }

    // =====================================================================
    // Finances
    // =====================================================================

    /** Factures a emettre en fin de chargement, dans l'ordre chronologique (numerotation continue F-AAAA-NNNN). */
    private array $pendingBills = [];

    private function cogebatFinances(User $karim, User $sophie, array $s, array $c): void
    {
        // ----- Villa Marceau : renovation, TVA 10 %, marge ~20 % -----
        $villa = $s['villa'];
        $q = $this->quote($villa, $karim, 'Rénovation complète de la villa', 18_600_000, 1000, $c['lefevre'], '2026-04-10', 'accepted', '2026-04-20',
            null, 'Devis signé le 20 avril. Situations mensuelles selon l’avancement.');
        $this->bill($q, $karim, 30, '2026-04-22', null, [['2026-05-02', 'all', 'virement']]);
        $this->bill($q, $karim, 15, '2026-06-30', null, [['2026-07-15', 'all', 'virement']]);
        $this->bill($q, $karim, 20, '2026-07-31', '+15 days', [['2026-09-04', 1_000_000, 'cheque']],
            'Échéance reportée au '.\App\Controller\DocumentController::frDate(new \DateTimeImmutable('+15 days')).' à la demande de Mme Lefèvre. Premier versement de 10 000 € reçu.');
        $this->bill($q, $karim, 15, '-38 days', '-8 days', [], null, [['-3 days 10:20', 'telephone', 'Mme Lefèvre attend le déblocage de son prêt, paiement promis sous 10 jours.']]);
        $this->bill($q, $karim, 10, '-4 days', '+26 days', [], null, [], $this->doc($villa, 'Situation de travaux n°4'));
        $this->quote($villa, $karim, 'Avenant n°1 : baie coulissante du séjour', 845_000, 1000, $c['lefevre'], '-7 days', 'sent', null, null, 'Ajout demandé à la visite du 28 septembre.');
        $this->expense($villa, $sophie, 'Membrane d’étanchéité, isolant et primaire', 'materiaux', 1_428_040, 2000, $c['pointp'], 'FA-26-08812', '-9 days', '-1 days', true, $this->doc($villa, 'Facture Point.P'));
        $this->expense($villa, $karim, 'Étanchéité toiture-terrasse (sous-traitance)', 'sous_traitance', 3_860_000, 0, $c['toitec'], 'TT-2026-0412', '-28 days', '+2 days', false, null,
            'Autoliquidation de la TVA (sous-traitance BTP, article 283-2 nonies du CGI).');
        $this->expense($villa, $sophie, 'Location mini-pelle 3 jours', 'location', 124_000, 2000, $c['kiloutou'], 'F2608-3310', '-45 days', '-15 days', true);
        $this->expense($villa, $karim, 'Menuiseries aluminium RAL 7016', 'materiaux', 4_190_000, 2000, $c['lorin'], 'ML-26-0219', '-12 days', '+20 days', false, $this->doc($villa, 'Devis menuiseries aluminium'));
        $this->expense($villa, $karim, 'Main-d’œuvre Cogebat (avril à septembre)', 'main_oeuvre', 5_200_000, 0, null, null, '-6 days', null, true);

        // ----- Residence Les Tilleuls : ravalement, TVA 10 %, marge ~24 % -----
        $til = $s['tilleuls'];
        $q = $this->quote($til, $karim, 'Ravalement des façades et reprise des acrotères', 24_800_000, 1000, $c['dubreuil'], '2026-02-10', 'accepted', '2026-02-24', $this->doc($til, 'Devis ravalement façades'));
        $this->bill($q, $karim, 30, '2026-03-02', null, [['2026-03-16', 'all', 'virement']]);
        $this->bill($q, $karim, 20, '2026-05-29', null, [['2026-06-20', 'all', 'virement']]);
        $this->bill($q, $karim, 15, '2026-07-31', null, [['2026-08-28', 'all', 'virement']]);
        $this->bill($q, $karim, 15, '-11 days', '+19 days', [], null, [], $this->doc($til, 'Situation de travaux n°3'));
        $this->expense($til, $sophie, 'Échafaudage façades (septembre)', 'location', 1_860_000, 2000, $c['kiloutou'], 'F2609-5521', '-15 days', '+15 days', true, $this->doc($til, 'Facture Kiloutou'));
        $this->expense($til, $sophie, 'Enduits, mortiers et fixations', 'materiaux', 3_140_000, 2000, $c['pointp'], 'FA-26-07730', '-40 days', '-10 days', true);
        $this->expense($til, $sophie, 'Couvertines aluminium acrotère', 'materiaux', 690_000, 2000, $c['pointp'], null, '-2 days', '+10 days', false);
        $this->expense($til, $karim, 'Main-d’œuvre Cogebat (mars à septembre)', 'main_oeuvre', 13_200_000, 0, null, null, '-6 days', null, true);

        // ----- Bureaux Voltaire : client professionnel, TVA 20 %, marge ~20 % -----
        $vol = $s['voltaire'];
        $q = $this->quote($vol, $karim, 'Aménagement de plateaux de bureaux R+1 et R+2', 41_200_000, 2000, $c['chen'], '2026-07-15', 'accepted', '2026-08-05',
            null, 'Paiement à 45 jours fin de mois. Copie systématique à la comptabilité de Voltaire Invest.');
        $this->bill($q, $karim, 20, '2026-08-25', null, [['2026-09-30', 'all', 'virement']]);
        $this->bill($q, $karim, 15, '-6 days', '+39 days', []);
        $this->expense($vol, $karim, 'Lot électricité courants forts et faibles', 'sous_traitance', 9_600_000, 0, $c['elec'], 'ES92-26-031', '-20 days', '+12 days', false, $this->doc($vol, 'Devis électricité'));
        $this->expense($vol, $sophie, 'Rails, montants et plaques de plâtre', 'materiaux', 685_000, 2000, $c['lm'], '88213', '-8 days', '+22 days', true, $this->doc($vol, 'Facture Leroy Merlin'));
        $this->expense($vol, $karim, 'Lot plomberie sanitaires', 'sous_traitance', 5_800_000, 0, null, 'PL-0926-14', '-13 days', '+25 days', false, $this->doc($vol, 'Devis plomberie'));
        $this->expense($vol, $karim, 'Cloisons et faux plafonds (sous-traitance)', 'sous_traitance', 7_200_000, 0, null, null, '-10 days', '+30 days', false);
        $this->expense($vol, $karim, 'Main-d’œuvre Cogebat (prévisionnel lot gros œuvre)', 'main_oeuvre', 9_800_000, 0, null, null, '-6 days', null, false);

        // ----- Maison Garnier : livree, tout regle sauf la retenue de garantie -----
        $gar = $s['garnier'];
        $q = $this->quote($gar, $karim, 'Extension de 35 m² et ouverture sur séjour', 9_650_000, 2000, $c['garnier'], '2025-09-26', 'accepted', '2025-10-05', $this->doc($gar, 'Devis extension'));
        $this->bill($q, $karim, 30, '2025-11-10', null, [['2025-11-21', 'all', 'virement']], null, [], $this->doc($gar, 'Facture d’acompte'));
        $this->bill($q, $karim, 40, '2026-03-31', null, [['2026-04-17', 'all', 'virement']]);
        $retenue = intdiv(FinanceEntry::vat(9_650_000, 2000) + 9_650_000 + 10, 20); // 5 % du TTC du marche
        $this->bill($q, $karim, null, '2026-07-24', '2027-07-10', [['2026-08-07', -$retenue, 'virement']],
            sprintf('Retenue de garantie de 5 %% (%s TTC) libérable au 10 juillet 2027, à la fin de l’année de parfait achèvement.', FinanceService::euros($retenue)),
            [], $this->doc($gar, 'Facture de solde'));
        $this->expense($gar, $karim, 'Matériaux gros œuvre et menuiseries', 'materiaux', 2_130_000, 2000, null, null, '2026-01-20', '2026-02-20', true);
        $this->expense($gar, $karim, 'Charpente et couverture (sous-traitance)', 'sous_traitance', 1_480_000, 0, null, 'CH-2026-008', '2026-02-15', '2026-03-15', true);
        $this->expense($gar, $karim, 'Main-d’œuvre Cogebat', 'main_oeuvre', 3_840_000, 0, null, null, '2026-07-15', null, true);

        // ----- Pharmacie du Marche : livree, soldee -----
        $ph = $s['pharma'];
        $q = $this->quote($ph, $karim, 'Réaménagement de l’officine (ERP 5e catégorie)', 6_480_000, 2000, $c['pharma'], '2025-09-12', 'accepted', '2025-09-25');
        $this->bill($q, $karim, 40, '2025-10-06', null, [['2025-10-20', 'all', 'virement']]);
        $this->bill($q, $karim, null, '2026-03-05', null, [['2026-04-03', 'all', 'virement']], null, [], $this->doc($ph, 'Facture de solde'));
        $this->expense($ph, $karim, 'Mobilier et agencement officine', 'materiaux', 2_890_000, 2000, null, null, '2025-11-30', '2025-12-30', true);
        $this->expense($ph, $karim, 'Électricité et éclairage (sous-traitance)', 'sous_traitance', 920_000, 0, $c['elec'], 'ES92-25-114', '2026-01-10', '2026-02-10', true);
        $this->expense($ph, $karim, 'Main-d’œuvre Cogebat', 'main_oeuvre', 1_310_000, 0, null, null, '2026-02-28', null, true);

        // ----- Loft Saint-Ouen : avant chantier, devis en attente -----
        $loft = $s['loft'];
        $this->quote($loft, $karim, 'Rénovation complète d’un loft de 140 m²', 17_850_000, 1000, $c['mercier'], '-6 days', 'sent', null, $this->doc($loft, 'Devis rénovation loft'),
            'Budget annoncé par M. Mercier : 180 k€. Démarrage souhaité en janvier.');
        $this->quote($loft, $karim, 'Option cuisine équipée et verrière atelier', 2_460_000, 1000, $c['mercier'], '-2 days', 'draft', null);

        $this->issueBills();
    }

    /** Devis numerote D-AAAA-NNNN ; envoye puis accepte aux dates donnees. */
    private function quote(Site $site, User $by, string $title, int $ht, int $vat, ?Contact $contact, string $issued, string $status, ?string $accepted = null, ?Document $doc = null, ?string $notes = null): FinanceEntry
    {
        $on = $this->day($issued);
        $f = new FinanceEntry($site, FinanceEntry::KIND_QUOTE, $title, $by, $on->setTime(9, 0));
        $f->setAmounts($ht, $vat);
        $f->setContact($contact);
        $f->setDocument($doc);
        $f->setNotes($notes);
        $f->setIssuedOn($on);
        $f->setNumber($this->finances->nextNumber($site, 'D', $on));
        $this->om->persist($f);
        if ($status !== FinanceEntry::STATUS_DRAFT) {
            $this->finances->changeStatus($f, FinanceEntry::STATUS_SENT, $by, $this->t($on->format('Y-m-d').' 9:30'));
        }
        if (in_array($status, [FinanceEntry::STATUS_ACCEPTED, FinanceEntry::STATUS_REFUSED], true)) {
            $this->finances->changeStatus($f, $status, $by, $this->t($this->day((string) $accepted)->format('Y-m-d').' 11:15'));
        }
        $f->touch($this->t($on->format('Y-m-d').' 9:30'));
        return $f;
    }

    /**
     * Facture tiree d'un devis (pourcentage, ou solde si null), emise plus tard dans l'ordre chronologique.
     * $payments : [date, montant en centimes | 'all' (solde) | negatif (= tout sauf ce montant), mode].
     */
    private function bill(FinanceEntry $quote, User $by, ?int $percent, string $issued, ?string $due, array $payments, ?string $notes = null, array $reminders = [], ?Document $doc = null): void
    {
        $inv = $this->finances->invoiceFromQuote($quote, $by, $percent, null);
        $inv->setDocument($doc);
        $inv->setNotes($notes);
        $on = $this->day($issued);
        $inv->setIssuedOn($on);
        $inv->setDueOn($due ? $this->day($due) : $on->modify('+30 days'));
        $this->pendingBills[] = [$on, $inv, $by, $payments, $reminders];
    }

    /** Emission des factures dans l'ordre des dates, puis paiements et relances. */
    private function issueBills(): void
    {
        $this->om->flush();
        usort($this->pendingBills, fn ($a, $b) => $a[0] <=> $b[0]);
        foreach ($this->pendingBills as [$on, $inv, $by, $payments, $reminders]) {
            /** @var FinanceEntry $inv */
            $this->finances->issueInvoice($inv, $by, $this->t($on->format('Y-m-d').' 17:00'));
            foreach ($payments as [$date, $amount, $method]) {
                $amount = $amount === 'all' ? $inv->getRemaining() : ($amount < 0 ? $inv->getRemaining() + $amount : $amount);
                $paidOn = $this->day($date);
                $this->finances->addPayment($inv, $by, $amount, $paidOn, $method, null, $this->t($paidOn->format('Y-m-d').' 10:00'));
            }
            foreach ($reminders as [$at, $channel, $note]) {
                $this->finances->addReminder($inv, $by, $channel, $note, $this->t($at));
            }
            $inv->touch($this->t($on->format('Y-m-d').' 17:00'));
        }
        $this->pendingBills = [];
        $this->om->flush();
    }

    /** Depense (facture fournisseur, sous-traitance, location, main-d'oeuvre) ; $paid : reglee a l'echeance. */
    private function expense(Site $site, User $by, string $title, string $category, int $ht, int $vat, ?Contact $supplier, ?string $ref, string $issued, ?string $due, bool $paid, ?Document $doc = null, ?string $notes = null): void
    {
        $on = $this->day($issued);
        $f = new FinanceEntry($site, FinanceEntry::KIND_EXPENSE, $title, $by, $on->setTime(12, 0));
        $f->setAmounts($ht, $vat);
        $f->setCategory($category);
        $f->setContact($supplier);
        $f->setNumber($ref);
        $f->setIssuedOn($on);
        $f->setDueOn($due ? $this->day($due) : null);
        $f->setDocument($doc);
        $f->setNotes($notes);
        $this->om->persist($f);
        if ($paid) {
            $paidOn = $f->getDueOn() && $f->getDueOn() < $this->now ? $f->getDueOn() : $on;
            $this->finances->addPayment($f, $by, $f->getRemaining(), $paidOn, 'virement', null, $this->t($paidOn->format('Y-m-d').' 10:00'));
        }
        $f->touch($this->t($on->format('Y-m-d').' 12:00'));
    }

    /** Document du chantier dont le titre commence par $title */
    private function doc(Site $site, string $title): ?Document
    {
        $this->om->flush();
        foreach ($this->om->getRepository(Document::class)->findBy(['site' => $site]) as $d) {
            if (str_starts_with($d->getTitle(), $title)) {
                return $d;
            }
        }
        return null;
    }

    /** "2026-04-10" ou "-6 days" -> date (minuit) */
    private function day(string $when): \DateTimeImmutable
    {
        return (new \DateTimeImmutable($when))->setTime(0, 0);
    }

    // =====================================================================
    // Outils
    // =====================================================================

    /** Moment passe (borne : jamais apres la limite, pour garder un historique credible). */
    private function t(string $when): \DateTimeImmutable
    {
        $d = new \DateTimeImmutable($when);
        return $d > $this->cap ? $this->cap : $d;
    }

    /** Moment a venir ou du jour, decale au lundi s'il tombe un week-end. */
    private function wd(string $when): \DateTimeImmutable
    {
        $d = new \DateTimeImmutable($when);
        $dow = (int) $d->format('N');
        return $dow >= 6 && !str_starts_with($when, 'today') && !str_starts_with($when, '-') ? $d->modify(sprintf('+%d days', 8 - $dow)) : $d;
    }

    private function user(Company $company, string $phone, string $first, string $last, string $job, string $kind = User::KIND_STAFF): User
    {
        $u = new User($company, $phone, $first, $last);
        $u->setJobTitle($job);
        $u->setKind($kind);
        $this->om->persist($u);
        return $u;
    }

    private function site(User $by, string $name, string $address, string $ref, ?string $client, ?string $startedOn, float $lat, float $lng): Site
    {
        $s = $this->sites->create($by, $name, $address, array_filter(['reference' => $ref, 'clientName' => $client, 'startedOn' => $startedOn]));
        $s->setCoordinates($lat, $lng);
        return $s;
    }

    private function member(Site $site, User $user, string $role): void
    {
        $this->om->persist(new SiteMember($site, $user, $role));
    }

    private function contact(Company $co, string $kind, string $name, ?string $companyName, ?string $job, ?string $phone, ?string $email, ?string $address, ?string $notes, array $sites): Contact
    {
        $c = new Contact($co, $kind, $name);
        $c->setCompanyName($companyName);
        $c->setJobTitle($job);
        $c->setPhone($phone ? (PhoneNumber::normalize($phone) ?? $phone) : null);
        $c->setEmail($email);
        $c->setAddress($address);
        $c->setNotes($notes);
        foreach ($sites as $s) {
            $c->addSite($s);
        }
        $this->om->persist($c);
        return $c;
    }

    private function folder(Site $site, string $kind): Folder
    {
        return $this->om->getRepository(Folder::class)->findOneBy(['site' => $site, 'kind' => $kind]);
    }

    /** @return array{internal: Channel, client: Channel} */
    private function channels(Site $site): array
    {
        $out = [];
        foreach ($this->om->getRepository(Channel::class)->findBy(['site' => $site]) as $c) {
            $out[$c->getKind()] = $c;
        }
        return $out;
    }

    private function document(Site $site, string $folderKind, string $title, string $type, User $by, string $filename, \DateTimeImmutable $at, string $label, string $visibility = Document::VISIBILITY_TEAM, ?Contact $contact = null): Document
    {
        $folder = $this->folder($site, $folderKind);
        $doc = new Document($site, $folder, $title, TitleNormalizer::normalize($title), $type, $by);
        $doc->setClassifiedBy('rule');
        $doc->setVisibility($visibility);
        $doc->setContact($contact);
        $this->om->persist($doc);
        $this->version($doc, $by, $filename, $at, $label, null, true);
        return $doc;
    }

    private function version(Document $doc, User $by, string $filename, \DateTimeImmutable $at, string $label, ?string $comment, bool $first = false): DocumentVersion
    {
        $pdf = self::pdf($doc->getTitle().' '.$label, $doc->getSite()->getName());
        $key = sprintf('%s/%s/fixtures/%s.pdf', $doc->getCompany()->getId(), $doc->getSite()->getId(), Uuid::v7());
        $this->storage->putContents($key, $pdf);
        $prev = $doc->getCurrentVersion();
        $v = new DocumentVersion($doc, $doc->nextVersionNumber(), $label, $key, $filename, 'application/pdf', strlen($pdf), hash('sha256', $pdf), $comment, $by, null, $at);
        $this->om->persist($v);
        $doc->addVersion($v);
        $payload = ['documentId' => (string) $doc->getId(), 'versionId' => (string) $v->getId(), 'versionLabel' => $label, 'folderName' => $doc->getFolder()->getName()];
        if ($first) {
            $this->activity->record($doc->getSite(), ActivityEvent::DOCUMENT_ADDED, $by, $doc->getTitle(), 'Classé automatiquement dans '.$doc->getFolder()->getName().'.', $payload, $doc->getVisibility(), $at);
        } else {
            $this->activity->record($doc->getSite(), ActivityEvent::DOCUMENT_VERSION, $by, $doc->getTitle().' '.$label,
                sprintf('Remplace la %s du %s.', $prev?->getLabel(), \App\Controller\DocumentController::frDate($prev->getUploadedAt())), $payload, $doc->getVisibility(), $at);
        }
        return $v;
    }

    /** @param list<array{0: User, 1: string, 2: string}> $messages auteur, texte, moment */
    private function conversation(Channel $c, array $messages): void
    {
        foreach ($messages as [$by, $body, $when]) {
            $m = new Message($c, $by, $body, null, $this->t($when));
            $this->om->persist($m);
            $c->onMessage($m);
            $this->activity->record($c->getSite(), ActivityEvent::MESSAGE, $by, $body, null,
                ['messageId' => (string) $m->getId(), 'channelId' => (string) $c->getId(), 'channel' => $c->getKind()],
                $c->isClient() ? Document::VISIBILITY_CLIENT : Document::VISIBILITY_TEAM, $m->getCreatedAt());
        }
    }

    /** @return list<string> identifiants des photos du lot */
    private function photoBatch(Site $site, User $by, \DateTimeImmutable $at, int $count, string $caption, string $visibility): array
    {
        $batch = Uuid::v7();
        $ids = [];
        for ($i = 0; $i < $count; ++$i) {
            [$jpeg, $w, $h] = self::jpeg($this->photoSeed++);
            $base = sprintf('%s/%s/fixtures/%s', $site->getCompany()->getId(), $site->getId(), Uuid::v7());
            $this->storage->putContents($base.'.jpg', $jpeg);
            $p = new Photo($site, $batch, $base.'.jpg', 'image/jpeg', strlen($jpeg), hash('sha256', $jpeg), $at->modify(sprintf('+%d minutes', $i * 2)),
                ($site->getLatitude() ?? 48.86) + $i * 0.00002, $site->getLongitude() ?? 2.35, 6.0, $caption, $visibility, $by, null);
            $p->setThumbnail($base.'.jpg', $w, $h);
            $this->om->persist($p);
            $this->activity->recordPhoto($p);
            $ids[] = $p->getId()->toRfc4122();
        }
        return $ids;
    }

    private function task(Site $site, string $title, User $by, ?User $assignee, ?string $due, string $priority = 'normal', ?string $doneAt = null): Task
    {
        // Creee quelques jours avant l'echeance, jamais dans le futur
        $dueDay = $due === null ? null : new \DateTimeImmutable(($due === 'today' ? 'today' : $due).' 00:00');
        $created = $dueDay ? min($dueDay->modify('-4 days 9:00'), $this->t('-1 days 9:00')) : $this->t('-2 days 9:00');
        $t = new Task($site, $title, $by, $created);
        $t->setAssignee($assignee);
        $t->setPriority($priority);
        $t->setDueOn($dueDay);
        if ($doneAt) {
            $at = $this->t($doneAt);
            $t->setDone(true, $at);
            $this->activity->record($site, ActivityEvent::TASK_DONE, $assignee ?? $by, $title, null, ['taskId' => (string) $t->getId()], Document::VISIBILITY_TEAM, $at);
        }
        $this->om->persist($t);
        return $t;
    }

    private function appointment(Company $co, string $title, string $start, ?string $end, ?Site $site, ?Contact $contact, ?string $location, User $by, ?string $notes): void
    {
        $a = new Appointment($co, $title, $this->wd($start), $by);
        $a->setEndsAt($end ? $this->wd($end) : null);
        $a->setSite($site);
        $a->setContact($contact);
        $a->setLocation($location ?? $site?->getAddress() ?? $contact?->getAddress());
        $a->setNotes($notes);
        $this->om->persist($a);
    }

    /** Signature de demonstration : une boucle et un paraphe, en coordonnees normalisees. */
    private static function strokes(int $seed): array
    {
        $a = [];
        for ($i = 0; $i <= 40; ++$i) {
            $x = 0.08 + $i * 0.012;
            $a[] = [$x, 0.55 - 0.25 * sin($i / 4 + $seed) * (1 - $i / 60)];
        }
        $b = [];
        for ($i = 0; $i <= 50; ++$i) {
            $t = $i / 50;
            $b[] = [0.55 + 0.35 * $t, 0.5 + 0.18 * sin($t * 9 + $seed) - 0.1 * $t];
        }
        $c = [[0.12, 0.8], [0.5, 0.78], [0.88, 0.74]];
        return [$a, $b, $c];
    }

    private function intervention(Site $site, User $author, string $on, string $title, string $work, ?string $materials, ?int $minutes, ?string $technicians, ?string $signer): Intervention
    {
        $day = new \DateTimeImmutable($on.' 00:00');
        $i = $this->interventions->create($site, $author, $day, $title, $work);
        $i->setMaterials($materials);
        $i->setMinutes($minutes);
        $i->setTechnicians($technicians);
        $i->setCreatedAt($this->t($day->format('Y-m-d').' 8:30'));
        if ($signer) {
            $this->om->flush();
            $at = $this->t($day->format('Y-m-d').' '.(8 + intdiv($minutes ?? 240, 60)).':'.sprintf('%02d', 10 + ($minutes ?? 0) % 40));
            $this->interventions->sign($i, $signer, self::strokes(strlen($signer)), 1, 0.4, $author, $at);
        }
        return $i;
    }

    /**
     * @param list<string> $photoIds
     * @param list<array{0: User, 1: ?string, 2: ?string, 3: string}> $history acteur, statut, note, moment
     */
    private function reserve(Site $site, string $kind, string $title, ?string $description, ?string $location, User $by, string $reportedAt, string $status, ?string $dueOn, ?User $assignee, string $visibility, array $photoIds, array $history): void
    {
        $at = $this->t($reportedAt);
        $r = new Reserve($site, $kind, $title, $by, $at);
        $r->setDescription($description);
        $r->setLocation($location);
        $r->setDueOn($dueOn ? new \DateTimeImmutable($dueOn.' 00:00') : null);
        $r->setAssignee($assignee);
        $r->setVisibility($visibility);
        $r->setPhotoIds($photoIds);
        $this->om->persist($r);
        $this->om->persist(new ReserveEvent($r, $by, Reserve::STATUS_OPEN, $by->isClient() ? 'Demande envoyée par le client.' : 'Signalée.', $at));
        $this->activity->record($site, ActivityEvent::RESERVE_OPENED, $by, $title,
            ['reserve' => 'Réserve', 'sav' => 'Demande SAV', 'garantie' => 'Garantie'][$kind].($location ? ' · '.$location : '').'.',
            ['reserveId' => (string) $r->getId()], $visibility, $at);
        foreach ($history as [$actor, $st, $note, $when]) {
            $w = $this->t($when);
            $this->om->persist(new ReserveEvent($r, $actor, $st, $note, $w));
            if ($st) {
                $this->activity->record($site, ActivityEvent::RESERVE_UPDATED, $actor,
                    sprintf('%s : %s', ['open' => 'À traiter', 'in_progress' => 'En cours', 'done' => 'Levée'][$st], $title), $note,
                    ['reserveId' => (string) $r->getId()], $visibility, $w);
            }
        }
        $r->setStatus($status, $status === Reserve::STATUS_DONE ? $this->t(end($history)[3] ?? $reportedAt) : null);
    }

    /** Pointages des 9 derniers jours ouvres (hors aujourd'hui), en alternant les chantiers. */
    private function week(User $u, array $sites, string $in, string $out): void
    {
        $today = new \DateTimeImmutable('today');
        $n = 0;
        for ($d = 13; $d >= 1; --$d) {
            $day = $today->modify("-$d days");
            if ((int) $day->format('N') >= 6) {
                continue;
            }
            $site = $sites[$n++ % count($sites)];
            $jitter = (crc32($u->getPhone().$day->format('Ymd')) % 21) - 10;
            $start = new \DateTimeImmutable($day->format('Y-m-d').' '.$in);
            $start = $start->modify(sprintf('%+d minutes', $jitter));
            $end = (new \DateTimeImmutable($day->format('Y-m-d').' '.$out))->modify(sprintf('%+d minutes', -$jitter * 2));
            $e = new TimeEntry($site, $u, $start);
            $lat = ($site->getLatitude() ?? 48.86) + ($jitter / 100000);
            $lng = $site->getLongitude() ?? 2.35;
            $e->setStart($lat, $lng, 8.0, ClockController::distance($site, $lat, $lng));
            $e->close($end, $lat, $lng);
            $this->om->persist($e);
        }
    }

    /** Arrivee du matin, pointage ouvert. $offset : distance approximative au chantier, en metres. */
    private function clockToday(User $u, Site $site, string $at, int $offset): void
    {
        $start = new \DateTimeImmutable('today '.$at);
        if ($start > $this->cap) {
            return; // trop tot dans la journee pour avoir pointe
        }
        $e = new TimeEntry($site, $u, $start);
        $lat = ($site->getLatitude() ?? 48.86) + $offset / 111000;
        $lng = $site->getLongitude() ?? 2.35;
        $d = ClockController::distance($site, $lat, $lng);
        $e->setStart($lat, $lng, 10.0, $d);
        $this->om->persist($e);
        $this->activity->record($site, ActivityEvent::CLOCK_IN, $u, $u->getFirstName().' est arrivé sur le chantier',
            $d <= 300 ? 'Sur place.' : sprintf('À %d m du chantier.', $d), [], Document::VISIBILITY_TEAM, $start);
    }

    /** Photo de demonstration : aplats de beton, d'ardoise, de bois ou de platre. */
    private static function jpeg(int $seed): array
    {
        $w = 640;
        $h = 480;
        $img = imagecreatetruecolor($w, $h);
        $palettes = [
            [[178, 174, 166], [120, 116, 108]], [[96, 104, 112], [60, 66, 72]], [[188, 160, 120], [140, 110, 76]],
            [[150, 156, 150], [92, 98, 92]], [[205, 200, 190], [160, 150, 136]], [[120, 132, 140], [178, 186, 190]],
        ];
        [$a, $b] = $palettes[$seed % count($palettes)];
        for ($y = 0; $y < $h; ++$y) {
            $t = $y / $h;
            $c = imagecolorallocate($img, (int) ($a[0] + ($b[0] - $a[0]) * $t), (int) ($a[1] + ($b[1] - $a[1]) * $t), (int) ($a[2] + ($b[2] - $a[2]) * $t));
            imageline($img, 0, $y, $w, $y, $c);
        }
        $line = imagecolorallocatealpha($img, 255, 255, 255, 100);
        for ($x = 40 + ($seed * 17) % 90; $x < $w + 120; $x += 90) {
            imageline($img, $x, 0, $x - 120, $h, $line);
        }
        $dark = imagecolorallocatealpha($img, 30, 34, 40, 90);
        imagefilledrectangle($img, 0, (int) ($h * (0.55 + ($seed % 3) * 0.08)), $w, $h, $dark);
        ob_start();
        imagejpeg($img, null, 80);
        return [(string) ob_get_clean(), $w, $h];
    }

    /** PDF d'une page, valide, avec un cartouche minimal. */
    private static function pdf(string $title, string $site): string
    {
        $esc = fn (string $s) => str_replace(['\\', '(', ')'], ['\\\\', '\\(', '\\)'], iconv('UTF-8', 'Windows-1252//TRANSLIT', $s) ?: $s);
        $content = "BT /F1 22 Tf 60 760 Td ({$esc($title)}) Tj ET\nBT /F1 12 Tf 60 735 Td ({$esc($site)} - document de demonstration Albert) Tj ET\n"
            ."0.8 w 60 80 m 535 80 l S 60 80 m 60 700 l S 535 80 m 535 700 l S 60 700 m 535 700 l S\n";
        $objs = [
            '<< /Type /Catalog /Pages 2 0 R >>',
            '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
            '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
            "<< /Length ".strlen($content)." >>\nstream\n".$content."endstream",
            '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
        ];
        $out = "%PDF-1.4\n";
        $offsets = [];
        foreach ($objs as $i => $o) {
            $offsets[] = strlen($out);
            $out .= ($i + 1)." 0 obj\n".$o."\nendobj\n";
        }
        $xref = strlen($out);
        $out .= "xref\n0 ".(count($objs) + 1)."\n0000000000 65535 f \n";
        foreach ($offsets as $off) {
            $out .= sprintf("%010d 00000 n \n", $off);
        }
        return $out."trailer\n<< /Size ".(count($objs) + 1)." /Root 1 0 R >>\nstartxref\n".$xref."\n%%EOF\n";
    }
}
