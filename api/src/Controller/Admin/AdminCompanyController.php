<?php

namespace App\Controller\Admin;

use App\Api\ApiProblem;
use App\Api\Input;
use App\Api\Presenter;
use App\Classification\DocumentClassifier;
use App\Entity\ActivityEvent;
use App\Entity\ClassificationRule;
use App\Entity\Document;
use App\Entity\Photo;
use App\Entity\Site;
use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;
use Symfony\Component\Uid\Uuid;

/** Parametrage de l'entreprise : modele d'arborescence, regles de classement, vue d'ensemble. */
#[Route('/api/admin')]
final class AdminCompanyController extends AbstractController
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly Presenter $present,
    ) {}

    #[Route('/overview', methods: ['GET'])]
    public function overview(#[CurrentUser] User $admin): JsonResponse
    {
        $count = fn (string $class, array $where = []) => $this->em->getRepository($class)->count($where);
        $since = new \DateTimeImmutable('-7 days');
        $week = (int) $this->em->createQueryBuilder()->select('COUNT(e.id)')->from(ActivityEvent::class, 'e')
            ->where('e.recordedAt > :w')->setParameter('w', $since)->getQuery()->getSingleScalarResult();
        $classified = $this->em->createQueryBuilder()->select('d.classifiedBy AS k, COUNT(d.id) AS n')
            ->from(Document::class, 'd')->groupBy('d.classifiedBy')->getQuery()->getArrayResult();

        return $this->json([
            'company' => $this->present->company($admin->getCompany()),
            'counts' => [
                'activeSites' => $count(Site::class, ['status' => Site::STATUS_ACTIVE]),
                'archivedSites' => $count(Site::class, ['status' => Site::STATUS_ARCHIVED]),
                'staff' => $count(User::class, ['kind' => User::KIND_STAFF, 'active' => true]),
                'clients' => $count(User::class, ['kind' => User::KIND_CLIENT, 'active' => true]),
                'documents' => $count(Document::class),
                'photos' => $count(Photo::class),
                'eventsLast7Days' => $week,
            ],
            // Part des documents classes sans correction : l'indicateur suivi chaque semaine (slide 18)
            'classification' => array_column($classified, 'n', 'k'),
        ]);
    }

    #[Route('/folder-template', methods: ['GET'])]
    public function folderTemplate(#[CurrentUser] User $admin): JsonResponse
    {
        return $this->json(['items' => $admin->getCompany()->getFolderTemplate()]);
    }

    /** Modele d'arborescence applique aux prochains chantiers. */
    #[Route('/folder-template', methods: ['PUT'])]
    public function saveFolderTemplate(#[CurrentUser] User $admin, Request $request): JsonResponse
    {
        $items = Input::from($request)->all()['items'] ?? null;
        if (!is_array($items) || !$items) {
            throw ApiProblem::validation(['items' => 'Le modèle doit contenir au moins un dossier.']);
        }
        $clean = [];
        foreach ($items as $i => $row) {
            $name = trim((string) ($row['name'] ?? ''));
            if ($name === '') {
                throw ApiProblem::validation(["items.$i.name" => 'Chaque dossier doit avoir un nom.']);
            }
            $kind = preg_replace('/[^a-z_]/', '', strtolower((string) ($row['kind'] ?? 'custom'))) ?: 'custom';
            $clean[] = ['kind' => $kind, 'name' => mb_substr($name, 0, 120)];
        }
        if (!in_array('divers', array_column($clean, 'kind'), true)) {
            $clean[] = ['kind' => 'divers', 'name' => 'Divers']; // Albert a toujours un endroit ou ranger
        }
        $admin->getCompany()->setFolderTemplate($clean);
        $this->em->flush();
        return $this->json(['items' => $clean]);
    }

    #[Route('/rules', methods: ['GET'])]
    public function rules(): JsonResponse
    {
        $rules = $this->em->getRepository(ClassificationRule::class)->findBy([], ['priority' => 'ASC']);
        return $this->json(['items' => array_map(fn (ClassificationRule $r) => $this->rule($r), $rules)]);
    }

    #[Route('/rules', methods: ['POST'])]
    public function createRule(#[CurrentUser] User $admin, Request $request): JsonResponse
    {
        [$pattern, $type, $kind, $priority] = $this->ruleInput(Input::from($request));
        $r = new ClassificationRule($admin->getCompany(), $pattern, $type, $kind, $priority ?? 100, 'admin');
        $this->em->persist($r);
        $this->em->flush();
        return $this->json($this->rule($r), 201);
    }

    #[Route('/rules/{id}', methods: ['PUT'])]
    public function updateRule(string $id, Request $request): JsonResponse
    {
        $r = $this->findRule($id);
        [$pattern, $type, $kind, $priority] = $this->ruleInput(Input::from($request));
        $r->update($pattern, $type, $kind, $priority ?? $r->getPriority());
        $this->em->flush();
        return $this->json($this->rule($r));
    }

    #[Route('/rules/{id}', methods: ['DELETE'])]
    public function deleteRule(string $id): JsonResponse
    {
        $this->em->remove($this->findRule($id));
        $this->em->flush();
        return $this->json(['ok' => true]);
    }

    /** Tester une regle sur un nom de fichier avant de l'enregistrer. */
    #[Route('/rules/test', methods: ['POST'], priority: 10)]
    public function testRules(#[CurrentUser] User $admin, Request $request): JsonResponse
    {
        $filename = Input::from($request)->required('filename', 'Le nom du fichier', 255);
        $name = \App\Classification\TitleNormalizer::normalizeName($filename);
        foreach ($this->em->getRepository(ClassificationRule::class)->findBy([], ['priority' => 'ASC']) as $r) {
            if ($r->matches($name)) {
                return $this->json([
                    'normalized' => $name,
                    'title' => \App\Classification\TitleNormalizer::displayTitle($filename),
                    'version' => \App\Classification\TitleNormalizer::extractVersion($filename),
                    'rule' => $this->rule($r),
                ]);
            }
        }
        return $this->json([
            'normalized' => $name,
            'title' => \App\Classification\TitleNormalizer::displayTitle($filename),
            'version' => \App\Classification\TitleNormalizer::extractVersion($filename),
            'rule' => null,
        ]);
    }

    private function ruleInput(Input $in): array
    {
        $pattern = $in->required('pattern', 'Le motif', 255);
        if (!ClassificationRule::isValidPattern($pattern)) {
            throw ApiProblem::validation(['pattern' => 'Ce motif n’est pas une expression valide.']);
        }
        $type = $in->oneOf('type', Document::TYPES, 'autre');
        $kind = $in->string('folderKind', null, 30) ?? DocumentClassifier::folderKindForType($type);
        return [$pattern, $type, $kind, $in->int('priority')];
    }

    private function rule(ClassificationRule $r): array
    {
        return [
            'id' => (string) $r->getId(),
            'pattern' => $r->getPattern(),
            'type' => $r->getType(),
            'folderKind' => $r->getFolderKind(),
            'priority' => $r->getPriority(),
            'source' => $r->getSource(),
            'hits' => $r->getHits(),
        ];
    }

    private function findRule(string $id): ClassificationRule
    {
        $r = Uuid::isValid($id) ? $this->em->find(ClassificationRule::class, Uuid::fromString($id)) : null;
        if (!$r) {
            throw new NotFoundHttpException('Règle introuvable.');
        }
        return $r;
    }
}
