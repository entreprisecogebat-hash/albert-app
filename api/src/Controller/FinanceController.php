<?php

namespace App\Controller;

use App\Api\ApiProblem;
use App\Api\Input;
use App\Api\Presenter;
use App\Entity\FinanceEntry;
use App\Entity\FinancePayment;
use App\Entity\User;
use App\Service\FinanceService;
use App\Service\SiteAccess;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;
use Symfony\Component\Uid\Uuid;

/**
 * Finances du chantier : devis, factures, depenses (reprise de l'app Android 0.2).
 * Chaque ecriture se fait dans une transaction : l'attribution d'un numero de facture et l'emission
 * sont validees ensemble ou pas du tout (voir FinanceService).
 */
final class FinanceController extends AbstractController
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly FinanceService $finances,
        private readonly SiteAccess $access,
        private readonly Presenter $present,
    ) {}

    #[Route('/api/finances', methods: ['GET'])]
    public function list(#[CurrentUser] User $user, Request $request): JsonResponse
    {
        $rows = $this->finances->list($user, $this->filters($request));
        return $this->json([
            'items' => array_map(fn (array $r) => $this->presentRow($r), array_slice($rows, 0, 500)),
            'summary' => $this->finances->summary($rows),
        ]);
    }

    /** Export pour le comptable. Reserve a ceux qui gerent les finances. */
    #[Route('/api/finances/export.csv', methods: ['GET'], priority: 10)]
    public function export(#[CurrentUser] User $user, Request $request): Response
    {
        $rows = array_values(array_filter(
            $this->finances->list($user, $this->filters($request)),
            fn (array $r) => $r[1] === FinanceService::MODE_MANAGE,
        ));
        if (!$rows && $user->isClient()) {
            throw $this->createAccessDeniedException('L’export est réservé à l’entreprise.');
        }
        $from = Input::queryDate($request, 'from');
        $to = Input::queryDate($request, 'to');
        $rows = array_values(array_filter($rows, function (array $r) use ($from, $to) {
            $d = ($r[0]->getIssuedOn() ?? $r[0]->getCreatedAt())->format('Y-m-d');
            return (!$from || $d >= $from->format('Y-m-d')) && (!$to || $d <= $to->format('Y-m-d'));
        }));
        usort($rows, fn ($a, $b) => [($a[0]->getIssuedOn() ?? $a[0]->getCreatedAt())->format('Y-m-d'), $a[0]->getKind(), (string) $a[0]->getNumber()]
            <=> [($b[0]->getIssuedOn() ?? $b[0]->getCreatedAt())->format('Y-m-d'), $b[0]->getKind(), (string) $b[0]->getNumber()]);

        $resp = new Response($this->finances->csv($rows));
        $resp->headers->set('Content-Type', 'text/csv; charset=utf-8');
        $resp->headers->set('Content-Disposition', sprintf('attachment; filename="albert-finances-%s.csv"', date('Ymd')));
        return $resp;
    }

    #[Route('/api/sites/{id}/finances', methods: ['POST'])]
    public function create(#[CurrentUser] User $user, string $id, Request $request): JsonResponse
    {
        $site = $this->access->site($id);
        $this->finances->requireManage($this->finances->siteMode($site, $user));
        $in = Input::from($request);
        $f = $this->em->wrapInTransaction(fn () => $this->finances->create($site, $user, $in));
        return $this->json($this->finances->detail($f, FinanceService::MODE_MANAGE), 201);
    }

    #[Route('/api/finances/{id}', methods: ['GET'])]
    public function show(#[CurrentUser] User $user, string $id): JsonResponse
    {
        [$f, $mode] = $this->finances->entry($id, $user);
        return $this->json($this->finances->detail($f, $mode));
    }

    #[Route('/api/finances/{id}', methods: ['PATCH'])]
    public function update(#[CurrentUser] User $user, string $id, Request $request): JsonResponse
    {
        [$f, $mode] = $this->finances->entry($id, $user);
        $this->finances->requireManage($mode);
        $in = Input::from($request);
        $this->em->wrapInTransaction(fn () => $this->finances->update($f, $user, $in));
        return $this->json($this->finances->detail($f, $mode));
    }

    #[Route('/api/finances/{id}', methods: ['DELETE'])]
    public function delete(#[CurrentUser] User $user, string $id): JsonResponse
    {
        [$f, $mode] = $this->finances->entry($id, $user);
        $this->finances->requireManage($mode);
        $this->em->wrapInTransaction(fn () => $this->finances->delete($f));
        return $this->json(['ok' => true]);
    }

    #[Route('/api/finances/{id}/payments', methods: ['POST'])]
    public function addPayment(#[CurrentUser] User $user, string $id, Request $request): JsonResponse
    {
        [$f, $mode] = $this->finances->entry($id, $user);
        $this->finances->requireManage($mode);
        $in = Input::from($request);
        $amount = $in->int('amount');
        if ($amount === null) {
            throw ApiProblem::validation(['amount' => 'Le montant du paiement est obligatoire.']);
        }
        $this->em->wrapInTransaction(fn () => $this->finances->addPayment(
            $f, $user, $amount,
            $in->day('paidOn') ?? new \DateTimeImmutable('today'),
            $in->string('method', 'virement'),
            $in->string('note', null, 500),
        ));
        return $this->json($this->finances->detail($f, $mode), 201);
    }

    #[Route('/api/payments/{id}', methods: ['DELETE'])]
    public function removePayment(#[CurrentUser] User $user, string $id): JsonResponse
    {
        $p = Uuid::isValid($id) ? $this->em->find(FinancePayment::class, Uuid::fromString($id)) : null;
        if (!$p) {
            throw new NotFoundHttpException('Paiement introuvable.');
        }
        [$f, $mode] = $this->finances->entry((string) $p->getEntry()->getId(), $user);
        $this->finances->requireManage($mode);
        $this->em->wrapInTransaction(fn () => $this->finances->removePayment($p));
        return $this->json($this->finances->detail($f, $mode));
    }

    #[Route('/api/finances/{id}/reminders', methods: ['POST'])]
    public function addReminder(#[CurrentUser] User $user, string $id, Request $request): JsonResponse
    {
        [$f, $mode] = $this->finances->entry($id, $user);
        $this->finances->requireManage($mode);
        $in = Input::from($request);
        $this->em->wrapInTransaction(fn () => $this->finances->addReminder($f, $user, (string) $in->string('channel', 'telephone'), $in->string('note', null, 1000)));
        return $this->json($this->finances->detail($f, $mode), 201);
    }

    #[Route('/api/finances/{id}/invoice', methods: ['POST'])]
    public function invoiceFromQuote(#[CurrentUser] User $user, string $id, Request $request): JsonResponse
    {
        [$quote, $mode] = $this->finances->entry($id, $user);
        $this->finances->requireManage($mode);
        $in = Input::from($request);
        $inv = $this->em->wrapInTransaction(fn () => $this->finances->invoiceFromQuote($quote, $user, $in->int('percent'), $in->string('title', null, 200)));
        return $this->json($this->finances->detail($inv, $mode), 201);
    }

    private function filters(Request $request): array
    {
        return [
            'siteId' => $request->query->get('siteId'),
            'kind' => $request->query->get('kind'),
            'status' => $request->query->get('status'),
            'contactId' => $request->query->get('contactId'),
        ];
    }

    /** @param array{0: FinanceEntry, 1: string} $r */
    private function presentRow(array $r): array
    {
        return $this->present->financeEntry($r[0], $r[1] === FinanceService::MODE_CLIENT);
    }
}
