<?php

namespace App\Service;

use App\Api\Presenter;
use App\Controller\DocumentController;
use App\Entity\Channel;
use App\Entity\Message;
use Doctrine\ORM\EntityManagerInterface;

/**
 * Resume des echanges d'un canal (F-17).
 *
 * Version 1 : regles codees en dur (CDC 4.2, « les fonctions previsibles sont codees en dur ») :
 *  - questions restees sans reponse : message termine par « ? » sans message d'un autre auteur ensuite ;
 *  - points a retenir : messages qui mentionnent une date, un jour ou un mot-cle de chantier
 *    (livraison, retard, reception, devis, facture, commande, fuite...).
 *
 * Point d'extension IA : quand Company::isAiEnabled() est vrai, un service implementant
 * resume(array $messages): ?string pourra remplacer le champ "text" (generatedBy = 'ai').
 * Il n'est pas appele en V1 : aucun message ne quitte le serveur.
 */
final class ChannelSummarizer
{
    private const KEYWORDS = [
        'livraison', 'livré', 'livre ', 'livrer', 'retard', 'décal', 'report', 'réception', 'reception', 'devis', 'facture',
        'commande', 'valid', 'accord', 'annul', 'urgent', 'fuite', 'problème', 'probleme', 'casse', 'reprise', 'rdv',
        'rendez-vous', 'réunion', 'visite', 'planning', 'avance', 'acompte', 'paiement', 'garantie', 'réserve',
    ];
    private const DAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche', 'demain', 'aujourd', 'ce soir', 'semaine prochaine'];
    private const MONTHS = 'janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre';

    public function __construct(private readonly EntityManagerInterface $em) {}

    public function summarize(Channel $channel, int $days = 30): array
    {
        $since = new \DateTimeImmutable(sprintf('-%d days', $days));
        /** @var list<Message> $messages */
        $messages = $this->em->createQueryBuilder()
            ->select('m', 'a')->from(Message::class, 'm')->leftJoin('m.author', 'a')
            ->where('m.channel = :c')->andWhere('m.createdAt >= :since')
            ->setParameter('c', $channel)->setParameter('since', $since)
            ->orderBy('m.createdAt', 'ASC')
            ->setMaxResults(300)
            ->getQuery()->getResult();

        $name = fn (Message $m) => $m->getAuthor()
            ? ($m->getAuthor()->isClient() ? $m->getAuthor()->getFullName() : $m->getAuthor()->getFirstName())
            : 'Albert';

        $participants = [];
        foreach ($messages as $m) {
            $participants[$name($m)] = true;
        }
        $participants = array_keys($participants);

        // Questions sans reponse
        $open = [];
        foreach ($messages as $i => $m) {
            if (!str_ends_with(rtrim($m->getBody(), " \t\n\r)»\"'"), '?')) {
                continue;
            }
            $answered = false;
            for ($j = $i + 1; $j < count($messages); ++$j) {
                if ($messages[$j]->getAuthor() !== $m->getAuthor()) {
                    $answered = true;
                    break;
                }
            }
            if (!$answered) {
                $open[] = ['body' => $m->getBody(), 'author' => $name($m), 'at' => Presenter::date($m->getCreatedAt())];
            }
        }

        // Points a retenir : les plus recents d'abord, 5 au plus
        $points = [];
        foreach (array_reverse($messages) as $m) {
            if (count($points) >= 5) {
                break;
            }
            if (!$this->isKeyPoint($m->getBody())) {
                continue;
            }
            $points[] = sprintf('%s, %s : %s', $name($m), self::when($m->getCreatedAt()), mb_strimwidth(trim($m->getBody()), 0, 160, '…'));
        }

        return [
            'channelId' => (string) $channel->getId(),
            'generatedBy' => 'rules',
            'from' => $messages ? Presenter::date($messages[0]->getCreatedAt()) : null,
            'to' => $messages ? Presenter::date($messages[count($messages) - 1]->getCreatedAt()) : null,
            'messagesCount' => count($messages),
            'participants' => $participants,
            'openQuestions' => $open,
            'keyPoints' => $points,
            'text' => $this->text($channel, $messages, $participants, $open, $points, $days),
        ];
    }

    private function isKeyPoint(string $body): bool
    {
        $b = mb_strtolower($body);
        foreach (self::KEYWORDS as $k) {
            if (str_contains($b, $k)) {
                return true;
            }
        }
        foreach (self::DAYS as $d) {
            if (str_contains($b, $d)) {
                return true;
            }
        }
        return (bool) preg_match('/\b\d{1,2}(er)?\s+('.self::MONTHS.')\b|\b\d{1,2}\/\d{1,2}\b|\b\d{1,2}\s?h(\d{2})?\b/u', $b);
    }

    /** @param list<Message> $messages */
    private function text(Channel $channel, array $messages, array $participants, array $open, array $points, int $days): string
    {
        $where = $channel->isClient() ? 'avec le client' : 'dans l’équipe';
        if (!$messages) {
            return sprintf('Aucun message %s ces %d derniers jours.', $where, $days);
        }
        $n = count($messages);
        $first = $messages[0]->getCreatedAt();
        $people = self::enumerate($participants);
        $parts = [sprintf(
            '%d message%s échangé%s %s depuis le %s, entre %s.',
            $n, $n > 1 ? 's' : '', $n > 1 ? 's' : '', $where, DocumentController::frDate($first), $people,
        )];
        if ($n === 1 || count($participants) === 1) {
            $parts[0] = sprintf('%d message%s %s depuis le %s, de %s.', $n, $n > 1 ? 's' : '', $where, DocumentController::frDate($first), $people);
        }
        if ($open) {
            $q = $open[count($open) - 1];
            $parts[] = count($open) === 1
                ? sprintf('Une question attend une réponse : « %s » (%s).', mb_strimwidth($q['body'], 0, 140, '…'), $q['author'])
                : sprintf('%d questions attendent une réponse, dont la dernière : « %s » (%s).', count($open), mb_strimwidth($q['body'], 0, 140, '…'), $q['author']);
        } else {
            $parts[] = 'Aucune question en attente.';
        }
        if ($points) {
            $parts[] = sprintf('%d point%s à retenir.', count($points), count($points) > 1 ? 's' : '');
        }
        $last = $messages[$n - 1];
        $parts[] = sprintf('Dernier message %s.', self::when($last->getCreatedAt()));
        return implode(' ', $parts);
    }

    private static function enumerate(array $names): string
    {
        if (count($names) <= 1) {
            return $names[0] ?? '';
        }
        $last = array_pop($names);
        return implode(', ', $names).' et '.$last;
    }

    /** "aujourd'hui a 9:42", "hier a 17:24", "le 3 septembre" */
    public static function when(\DateTimeImmutable $d): string
    {
        $today = new \DateTimeImmutable('today');
        if ($d >= $today) {
            return 'aujourd’hui à '.$d->format('G:i');
        }
        if ($d >= $today->modify('-1 day')) {
            return 'hier à '.$d->format('G:i');
        }
        return 'le '.DocumentController::frDate($d);
    }
}
