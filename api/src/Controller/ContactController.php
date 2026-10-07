<?php

namespace App\Controller;

use App\Api\ApiProblem;
use App\Api\Input;
use App\Api\Presenter;
use App\Entity\Appointment;
use App\Entity\Contact;
use App\Entity\Document;
use App\Entity\User;
use App\Service\ContactImporter;
use App\Service\PhoneNumber;
use App\Service\SiteAccess;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\File\UploadedFile;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;
use Symfony\Component\Uid\Uuid;

/** Carnet de contacts de l'entreprise (F-01, F-03). Reserve a l'equipe. */
#[Route('/api/contacts')]
final class ContactController extends AbstractController
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly Presenter $present,
        private readonly SiteAccess $access,
    ) {}

    #[Route('', methods: ['GET'])]
    public function list(#[CurrentUser] User $user, Request $request): JsonResponse
    {
        $this->requireTeam($user);
        $qb = $this->em->createQueryBuilder()->select('c')->from(Contact::class, 'c')
            ->where('c.company = :co')->setParameter('co', $user->getCompany())
            ->orderBy('c.name', 'ASC')->setMaxResults(1000);
        if ($q = trim((string) $request->query->get('q'))) {
            $digits = preg_replace('/\D/', '', $q);
            $qb->andWhere('LOWER(c.name) LIKE :q OR LOWER(c.companyName) LIKE :q OR LOWER(c.email) LIKE :q OR LOWER(c.notes) LIKE :q'.(strlen($digits) >= 4 ? ' OR c.phone LIKE :d' : ''))
                ->setParameter('q', '%'.mb_strtolower($q).'%');
            if (strlen($digits) >= 4) {
                $qb->setParameter('d', '%'.ltrim($digits, '0').'%');
            }
        }
        if (in_array($kind = $request->query->get('kind'), Contact::KINDS, true)) {
            $qb->andWhere('c.kind = :k')->setParameter('k', $kind);
        }
        if ($siteId = $request->query->get('siteId')) {
            $site = $this->access->site($siteId);
            $this->access->member($site, $user);
            $qb->andWhere(':site MEMBER OF c.sites')->setParameter('site', $site);
        }
        return $this->json(['items' => array_map(fn (Contact $c) => $this->present->contact($c), $qb->getQuery()->getResult())]);
    }

    #[Route('', methods: ['POST'])]
    public function create(#[CurrentUser] User $user, Request $request): JsonResponse
    {
        $this->requireTeam($user);
        $in = Input::from($request);
        $c = new Contact($user->getCompany(), $in->oneOf('kind', Contact::KINDS, 'prospect'), $in->required('name', 'Le nom', 160));
        $this->apply($c, $in, $user);
        $this->em->persist($c);
        $this->em->flush();
        return $this->json($this->present->contact($c), 201);
    }

    /** Import CSV : avant de creer un chantier, reprendre ses prospects et clients d'Excel. */
    #[Route('/import', methods: ['POST'])]
    public function import(#[CurrentUser] User $user, Request $request, ContactImporter $importer): JsonResponse
    {
        $this->requireTeam($user);
        $file = $request->files->get('file');
        if (!$file instanceof UploadedFile || !$file->isValid()) {
            throw ApiProblem::validation(['file' => 'Aucun fichier reçu.']);
        }
        if ($file->getSize() > 5 * 1024 * 1024) {
            throw ApiProblem::validation(['file' => 'Ce fichier dépasse 5 Mo.']);
        }
        $result = $importer->import($user->getCompany(), (string) file_get_contents($file->getPathname()));
        $this->em->flush();
        return $this->json($result);
    }

    #[Route('/{id}', methods: ['GET'])]
    public function show(#[CurrentUser] User $user, string $id): JsonResponse
    {
        $this->requireTeam($user);
        $c = $this->find($id, $user);
        $docs = $this->em->getRepository(Document::class)->findBy(['contact' => $c], ['updatedAt' => 'DESC'], 100);
        // Un document d'un chantier dont je ne suis pas membre reste invisible
        $docs = array_values(array_filter($docs, function (Document $d) use ($user) {
            try {
                $this->access->member($d->getSite(), $user);
                return true;
            } catch (\Throwable) {
                return false;
            }
        }));
        $appointments = $this->em->getRepository(Appointment::class)->findBy(['contact' => $c], ['startsAt' => 'DESC'], 50);
        return $this->json($this->present->contact($c) + [
            'documents' => array_map(fn (Document $d) => $this->present->document($d), $docs),
            'appointments' => array_map(fn (Appointment $a) => $this->present->appointment($a), $appointments),
        ]);
    }

    #[Route('/{id}', methods: ['PATCH'])]
    public function update(#[CurrentUser] User $user, string $id, Request $request): JsonResponse
    {
        $this->requireTeam($user);
        $c = $this->find($id, $user);
        $in = Input::from($request);
        if ($in->has('name')) {
            $c->setName($in->required('name', 'Le nom', 160));
        }
        if ($in->has('kind')) {
            $c->setKind($in->oneOf('kind', Contact::KINDS));
        }
        $this->apply($c, $in, $user);
        $c->touch();
        $this->em->flush();
        return $this->json($this->present->contact($c));
    }

    private function apply(Contact $c, Input $in, User $user): void
    {
        foreach (['companyName' => 160, 'jobTitle' => 120, 'address' => 255, 'notes' => 4000] as $k => $max) {
            if ($in->has($k)) {
                $c->{'set'.ucfirst($k)}($in->string($k, null, $max));
            }
        }
        if ($in->has('email')) {
            $email = $in->string('email', null, 180);
            if ($email !== null && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
                throw ApiProblem::validation(['email' => 'Adresse email invalide.']);
            }
            $c->setEmail($email);
        }
        if ($in->has('phone')) {
            $raw = $in->string('phone', null, 40);
            $c->setPhone($raw === null ? null : (PhoneNumber::normalize($raw) ?? $raw));
        }
        if ($in->has('siteIds')) {
            $sites = [];
            foreach ($in->uuids('siteIds') as $sid) {
                $site = $this->access->site($sid->toRfc4122());
                $this->access->member($site, $user);
                $sites[] = $site;
            }
            $c->setSites($sites);
        }
    }

    private function find(string $id, User $user): Contact
    {
        $c = Uuid::isValid($id) ? $this->em->find(Contact::class, Uuid::fromString($id)) : null;
        if (!$c || $c->getCompany() !== $user->getCompany()) {
            throw new NotFoundHttpException('Contact introuvable.');
        }
        return $c;
    }

    private function requireTeam(User $user): void
    {
        if ($user->isClient()) {
            throw new AccessDeniedHttpException("Les contacts sont réservés à l'équipe.");
        }
    }
}
