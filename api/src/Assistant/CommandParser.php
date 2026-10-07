<?php

namespace App\Assistant;

/**
 * Comprend une commande dictee a Albert (« Ajoute un nouveau chantier pour Zazoun ») et en tire
 * une proposition d'action, que l'utilisateur valide ou corrige avant toute creation.
 *
 * Que des regles, sans service exterieur : gratuit, previsible, testable. Une IA pourra prendre
 * le relais sur les phrases que les regles ne comprennent pas (action « unknown »).
 *
 * Actions : site (nouveau chantier), task, appointment, message (equipe), reserve.
 */
final class CommandParser
{
    private const DAYS = ['lundi' => 1, 'mardi' => 2, 'mercredi' => 3, 'jeudi' => 4, 'vendredi' => 5, 'samedi' => 6, 'dimanche' => 7];
    private const MONTHS = ['janvier' => 1, 'fevrier' => 2, 'mars' => 3, 'avril' => 4, 'mai' => 5, 'juin' => 6, 'juillet' => 7, 'aout' => 8, 'septembre' => 9, 'octobre' => 10, 'novembre' => 11, 'decembre' => 12];
    private const NUMBERS = ['une' => 1, 'un' => 1, 'deux' => 2, 'trois' => 3, 'quatre' => 4, 'cinq' => 5, 'six' => 6, 'sept' => 7, 'huit' => 8, 'neuf' => 9, 'dix' => 10, 'onze' => 11, 'douze' => 12, 'quinze' => 15, 'vingt' => 20];

    /** Ce qui precede une date et part avec elle : « pour vendredi », « d'ici demain ». */
    private const WHEN = '(?:(?:pour|d[’\']ici|avant|à partir de|a partir de|dès|des)\s+)?';

    private string $text;
    /** Texte qui reste a interpreter, une fois retires la date, l'heure, le chantier, la personne. */
    private string $rest;

    /**
     * @param list<array{id: string, name: string, clientName: ?string}> $sites chantiers de l'utilisateur
     * @param list<array{id: string, firstName: string, fullName: string}> $people l'equipe de l'entreprise
     * @param string $meId l'utilisateur qui parle (« pour moi », « rappelle-moi »)
     * @param ?string $currentSiteId chantier ou il est pointe : cible par defaut
     */
    public function parse(string $text, \DateTimeImmutable $now, array $sites, array $people, string $meId, ?string $currentSiteId = null): array
    {
        $now = $now->setTimezone(new \DateTimeZone('Europe/Paris'));
        $this->text = self::clean($text);
        $this->rest = $this->text;
        $n = self::norm($this->text);

        if ($n === '') {
            return self::unknown($this->text, 'Je n’ai rien entendu.');
        }

        // Ordre : du plus explicite au plus general.
        if (preg_match('/\b(nouveau|nouvel|nouvelle|cree|creer|creez|ajoute|ajouter|ouvre|ouvrir|demarre)\b.{0,25}\bchantiers?\b/u', $n)
            || preg_match('/^chantier\s+(pour|chez|de)\b/u', $n)) {
            return $this->site();
        }
        // Un message peut citer une livraison ou une reserve : il passe avant.
        if (preg_match('/\b(dis|dites|previens|prevenez|informe|informez|ecris|envoie|envoyer|message|annonce)\b.{0,30}\b(equipe|tout le monde|gars|collegues|les autres)\b/u', $n)
            || preg_match('/^(message|dis a l equipe|previens l equipe)\b/u', $n)) {
            return $this->message($sites, $currentSiteId);
        }
        if (preg_match('/\b(reserves?|sav|garantie)\b/u', $n)) {
            return $this->reserve($n, $now, $sites, $people, $meId, $currentSiteId);
        }
        if (preg_match('/\b(rendez[- ]?vous|rdv|reunion|rencontre|visite|livraison|agenda|planifie|rendez)\b/u', $n)) {
            return $this->appointment($now, $sites, $currentSiteId);
        }
        if (preg_match('/\b(tache|rappelle|rappeler|rappel|oublie|pense|penser|faut|faudra|commander|commande|verifier|a faire)\b/u', $n)) {
            return $this->task($now, $sites, $people, $meId, $currentSiteId);
        }

        return self::unknown($this->text, 'Je n’ai pas compris quelle action faire. Essayez par exemple « Nouveau chantier pour Dupont » ou « Rappelle à Sophie de commander les plinthes vendredi ».');
    }

    /* ---------------------------------------------------------------- actions */

    private function site(): array
    {
        $t = $this->text;
        $address = null;
        // Adresse : un numero suivi d'un type de voie, jusqu'a la fin (ville comprise).
        if (preg_match('/,?\s*(?:au|à|a|situ[ée]e? au|adresse|à l[’\']adresse)?\s*(\d+\s*(?:bis|ter)?,?\s+(?:rue|avenue|av\.?|boulevard|bd|place|chemin|allée|allee|impasse|route|quai|cours|square|voie|passage|résidence|residence|lotissement)\b.+)$/iu', $t, $m, PREG_OFFSET_CAPTURE)) {
            $address = self::sentence(rtrim($m[1][0], ' .'));
            $t = substr($t, 0, $m[0][1]);
        }
        // Ce qui suit le mot « chantier » : « pour Zazoun », « Villa des Roses pour M. Dupont », « chez les Martin ».
        $after = preg_match('/chantiers?\s+(.*)$/iu', $t, $m) ? $m[1] : $t;
        $after = preg_replace('/^(?:qui s[’\']appelle|appel[ée]e?|nomm[ée]e?|intitul[ée]e?)\s+/iu', '', trim($after));
        $name = $client = null;
        if (preg_match('/^(?:pour|chez|de)\s+(?:le client\s+|la cliente\s+|les\s+|la famille\s+)?(.+)$/iu', $after, $m)) {
            $client = self::title($m[1]);
            $name = $client;
        } elseif (preg_match('/^(.+?)\s+(?:pour|chez)\s+(?:le client\s+|la cliente\s+|les\s+|la famille\s+)?(.+)$/iu', $after, $m)) {
            $name = self::title($m[1]);
            $client = self::title($m[2]);
        } elseif ($after !== '') {
            $name = self::title($after);
        }
        $name = $name !== null ? trim($name, " ,.") : null;
        $missing = [];
        if (!$name) {
            $missing[] = 'name';
        }
        if (!$address) {
            $missing[] = 'address';
        }

        return [
            'action' => 'site',
            'transcript' => $this->text,
            'summary' => $name ? "Créer le chantier « {$name} »" : 'Créer un chantier',
            'fields' => ['name' => $name, 'clientName' => $client, 'address' => $address],
            'missing' => $missing,
        ];
    }

    private function task(\DateTimeImmutable $now, array $sites, array $people, string $meId, ?string $currentSiteId): array
    {
        $site = $this->takeSite($sites, $currentSiteId);
        [$date] = $this->takeWhen($now);
        $assignee = $this->takePerson($people, $meId);
        $title = $this->rest;
        // Formules d'amorce : « crée une tâche », « rappelle à Sophie de », « il faut », « pense à ».
        $title = preg_replace('/^(?:(?:est-ce que tu peux|tu peux|peux-tu|merci de|albert)\s*,?\s*)?(?:(?:cr[ée]e|ajoute|note|mets?)\s+(?:moi\s+)?(?:une?\s+)?(?:nouvelle\s+)?(?:t[âa]che|rappel|truc)\s*(?:pour\s+)?(?::|de|d[’\']|qui consiste à|à)?\s*)?/iu', '', $title);
        $title = preg_replace('/^(?:rappelle[- ]?(?:moi|lui|leur)?|rappel|n[’\']oublie pas|pense|il faut|faut|il faudra|faudra|faut qu[’\']on|il faut qu[’\']on)\s*(?:à|a|de|d[’\']|que|qu[’\'])?\s*/iu', '', trim($title));
        $title = preg_replace('/^(?:de|d[’\']|à|a)\s+/iu', '', trim($title));
        $title = self::sentence(trim($title, " ,.:"));
        $missing = [];
        if ($title === '') {
            $missing[] = 'title';
        }
        if (!$site) {
            $missing[] = 'siteId';
        }

        return [
            'action' => 'task',
            'transcript' => $this->text,
            'summary' => 'Créer la tâche « '.($title ?: '…').' »'.($assignee ? ' pour '.$assignee['firstName'] : '').($date ? ', '.self::dayLabel($date, $now) : ''),
            'fields' => [
                'siteId' => $site['id'] ?? null, 'siteName' => $site['name'] ?? null,
                'title' => $title,
                'dueOn' => $date?->format('Y-m-d'),
                'assigneeId' => $assignee['id'] ?? null, 'assigneeName' => $assignee['fullName'] ?? null,
            ],
            'missing' => $missing,
        ];
    }

    private function appointment(\DateTimeImmutable $now, array $sites, ?string $currentSiteId): array
    {
        $site = $this->takeSite($sites, $currentSiteId);
        [$date, $time] = $this->takeWhen($now);
        $title = preg_replace('/^(?:(?:cr[ée]e|ajoute|mets?|note|planifie|programme|cale)\s+(?:moi\s+)?(?:un|une)?\s*(?:rendez[- ]?vous|rdv)?\s*(?:dans l[’\']agenda)?\s*(?::|pour|de|d[’\'])?\s*)/iu', '', $this->rest);
        $title = preg_replace('/^(?:j[’\']ai|on a|il y a)\s+(?:un|une)?\s*/iu', '', trim($title));
        $title = self::sentence(trim($title, " ,.:"));
        if ($title === '' || preg_match('/^(rendez[- ]?vous|rdv)$/iu', $title)) {
            $title = 'Rendez-vous';
        }
        $startsAt = null;
        $missing = [];
        if ($date) {
            [$h, $min] = $time ?? [8, 0];
            $startsAt = $date->setTime($h, $min);
            if (!$time) {
                $missing[] = 'time';
            }
        } else {
            $missing[] = 'startsAt';
        }

        return [
            'action' => 'appointment',
            'transcript' => $this->text,
            'summary' => "Ajouter « {$title} » à l’agenda".($startsAt ? ', '.self::dayLabel($startsAt, $now).($time ? ' à '.$startsAt->format('G\hi') : '') : ''),
            'fields' => [
                'siteId' => $site['id'] ?? null, 'siteName' => $site['name'] ?? null,
                'title' => $title,
                'startsAt' => $startsAt?->format(\DateTimeInterface::ATOM),
                'endsAt' => $startsAt?->modify('+1 hour')->format(\DateTimeInterface::ATOM),
            ],
            'missing' => $missing,
        ];
    }

    private function message(array $sites, ?string $currentSiteId): array
    {
        $site = $this->takeSite($sites, $currentSiteId);
        $body = $this->rest;
        if (preg_match('/^.{0,60}?\b(?:[ée]quipe|tout le monde|gars|coll[èe]gues|les autres)\b\s*(?:que|qu[’\']|:|,)?\s*(.+)$/iu', $body, $m)) {
            $body = $m[1];
        } else {
            $body = preg_replace('/^(?:message|envoie un message|[ée]cris)\s*(?::|à|a|que)?\s*/iu', '', $body);
        }
        $body = self::sentence(trim($body, " ,:"));
        if ($body !== '' && !preg_match('/[.!?]$/u', $body)) {
            $body .= '.';
        }
        $missing = [];
        if ($body === '') {
            $missing[] = 'body';
        }
        if (!$site) {
            $missing[] = 'siteId';
        }

        return [
            'action' => 'message',
            'transcript' => $this->text,
            'summary' => 'Écrire à l’équipe'.($site ? ' de '.$site['name'] : ''),
            'fields' => ['siteId' => $site['id'] ?? null, 'siteName' => $site['name'] ?? null, 'body' => $body],
            'missing' => $missing,
        ];
    }

    private function reserve(string $n, \DateTimeImmutable $now, array $sites, array $people, string $meId, ?string $currentSiteId): array
    {
        $kind = preg_match('/\bsav\b/u', $n) ? 'sav' : (preg_match('/\bgarantie\b/u', $n) ? 'garantie' : 'reserve');
        $site = $this->takeSite($sites, $currentSiteId);
        [$date] = $this->takeWhen($now);
        $assignee = $this->takePerson($people, $meId);
        $title = preg_replace('/^.*?\b(?:r[ée]serves?|sav|garantie)\b\s*(?::|,|pour|sur)?\s*/iu', '', $this->rest);
        $title = preg_replace('/^(?:il y a|y a|on a)\s+/iu', '', trim($title));
        $title = self::sentence(trim($title, " ,.:"));
        $missing = [];
        if ($title === '') {
            $missing[] = 'title';
        }
        if (!$site) {
            $missing[] = 'siteId';
        }
        $label = ['reserve' => 'la réserve', 'sav' => 'le SAV', 'garantie' => 'la garantie'][$kind];

        return [
            'action' => 'reserve',
            'transcript' => $this->text,
            'summary' => "Signaler {$label} « ".($title ?: '…').' »'.($site ? ' sur '.$site['name'] : ''),
            'fields' => [
                'siteId' => $site['id'] ?? null, 'siteName' => $site['name'] ?? null,
                'kind' => $kind, 'title' => $title,
                'dueOn' => $date?->format('Y-m-d'),
                'assigneeId' => $assignee['id'] ?? null, 'assigneeName' => $assignee['fullName'] ?? null,
            ],
            'missing' => $missing,
        ];
    }

    /* --------------------------------------------------------- extractions */

    /** Le chantier nomme dans la phrase (nom ou client), sinon celui ou l'on est pointe. */
    private function takeSite(array $sites, ?string $currentSiteId): ?array
    {
        $words = explode(' ', self::norm($this->rest));
        $best = null;
        $bestLen = 0;
        foreach ($sites as $s) {
            foreach (array_filter([$s['name'], $s['clientName'] ?? null]) as $label) {
                $l = self::norm($label);
                $found = $l !== '' && strlen($l) > $bestLen ? self::findWords($words, explode(' ', $l)) : null;
                if ($found !== null) {
                    // On retire du texte ce qui a ete dit (« Villa Marseau »), pas le nom exact.
                    $best = ['site' => $s, 'label' => $found];
                    $bestLen = strlen($l);
                }
            }
        }
        if ($best) {
            $this->rest = self::cut($this->rest, '(?:(?:sur|pour|dans|à|a|chez)\s+)?(?:(?:le|du)\s+chantier\s+)?(?:(?:de|des|du|la|le|les)\s+)?'.self::loose($best['label']));
            return $best['site'];
        }
        foreach ($sites as $s) {
            if ($s['id'] === $currentSiteId) {
                return $s;
            }
        }
        return null;
    }

    /** Une personne de l'equipe citee par son prenom (« à Sophie », « pour Yanis »), ou « moi ». */
    private function takePerson(array $people, string $meId): ?array
    {
        $n = self::norm($this->rest);
        foreach ($people as $p) {
            foreach ([$p['fullName'], $p['firstName']] as $label) {
                $l = self::norm($label);
                if ($l !== '' && preg_match('/\b'.preg_quote($l, '/').'\b/u', $n)) {
                    $this->rest = self::cut($this->rest, '(?:(?:à|a|pour|par)\s+)?'.self::loose($label));
                    return $p;
                }
            }
        }
        if (preg_match('/\b(rappelle[- ]?moi|pour moi|me rappeler)\b/u', $n)) {
            foreach ($people as $p) {
                if ($p['id'] === $meId) {
                    $this->rest = self::cut($this->rest, 'pour moi');
                    return $p;
                }
            }
        }
        return null;
    }

    /**
     * La date et l'heure dites : « demain », « vendredi », « le 12 octobre », « dans 3 jours »,
     * « 8 h », « 14h30 », « à midi ». Les retire du texte.
     *
     * @return array{0: ?\DateTimeImmutable, 1: ?array{int, int}}
     */
    private function takeWhen(\DateTimeImmutable $now): array
    {
        $today = $now->setTime(0, 0);
        $date = null;
        $time = null;
        $n = self::norm($this->rest);

        if (preg_match('/\bapres[- ]demain\b/u', $n)) {
            $date = $today->modify('+2 days');
            $this->rest = self::cut($this->rest, self::WHEN.'apr[èe]s[- ]demain');
        } elseif (preg_match('/\bdemain\b/u', $n)) {
            $date = $today->modify('+1 day');
            $this->rest = self::cut($this->rest, self::WHEN.'demain');
        } elseif (preg_match('/\b(aujourd hui|ce soir|ce matin|cet apres[- ]midi)\b/u', $n)) {
            $date = $today;
            $this->rest = self::cut($this->rest, self::WHEN.'(?:aujourd[’\' ]hui|ce soir|ce matin|cet apr[èe]s[- ]midi)');
        } elseif (preg_match('/\bdans\s+(\d+|'.implode('|', array_keys(self::NUMBERS)).')\s+(jours?|semaines?)\b/u', $n, $m)) {
            $k = ctype_digit($m[1]) ? (int) $m[1] : self::NUMBERS[$m[1]];
            $date = $today->modify('+'.($m[2][0] === 's' ? 7 * $k : $k).' days');
            $this->rest = self::cut($this->rest, self::WHEN.'dans\s+\S+\s+(?:jours?|semaines?)');
        } elseif (preg_match('/\b(?:le\s+)?(\d{1,2}|1er|premier)\s+('.implode('|', array_keys(self::MONTHS)).')\b/u', $n, $m)) {
            $day = ctype_digit($m[1]) ? (int) $m[1] : 1;
            $month = self::MONTHS[$m[2]];
            $date = $today->setDate((int) $today->format('Y'), $month, $day);
            if ($date < $today) {
                $date = $date->modify('+1 year');
            }
            $this->rest = self::cut($this->rest, self::WHEN.'(?:le\s+)?(?:\d{1,2}|1er|premier)\s+'.self::loose($m[2]));
        } elseif (preg_match('/\b(?:(ce|cette)\s+)?('.implode('|', array_keys(self::DAYS)).')(?:\s+(prochain|prochaine|qui vient))?\b/u', $n, $m)) {
            $target = self::DAYS[$m[2]];
            $diff = ($target - (int) $today->format('N') + 7) % 7;
            if ($diff === 0) {
                $diff = 7; // « vendredi » dit un vendredi : le suivant
            }
            if (!empty($m[3]) && $diff < 7 && $m[3] !== 'qui vient' && $diff <= 2) {
                $diff += 7; // « lundi prochain » dit un samedi : pas apres-demain
            }
            $date = $today->modify("+{$diff} days");
            $this->rest = self::cut($this->rest, self::WHEN.'(?:(?:ce|cette)\s+)?'.$m[2].'(?:\s+(?:prochain|prochaine|qui vient))?');
        } elseif (preg_match('/\b(la semaine prochaine)\b/u', $n)) {
            $date = $today->modify('next monday');
            $this->rest = self::cut($this->rest, self::WHEN.'la semaine prochaine');
        } elseif (preg_match('/\b(?:le\s+)(\d{1,2})\b(?!\s*h)/u', $n, $m) && (int) $m[1] >= 1 && (int) $m[1] <= 31) {
            $date = $today->setDate((int) $today->format('Y'), (int) $today->format('n'), (int) $m[1]);
            if ($date < $today) {
                $date = $date->modify('+1 month');
            }
            $this->rest = self::cut($this->rest, self::WHEN.'le\s+'.$m[1]);
        }

        $n = self::norm($this->rest);
        if (preg_match('/\b(\d{1,2})\s*(?:h|heures?)\s*(\d{2})?\b/u', $n, $m) && (int) $m[1] < 24) {
            $time = [(int) $m[1], isset($m[2]) && $m[2] !== '' ? (int) $m[2] : 0];
            $this->rest = self::cut($this->rest, '(?:(?:à|a|vers|pour)\s+)?'.$m[1].'\s*(?:h|heures?)\s*(?:'.($m[2] ?? '').')?');
        } elseif (preg_match('/\b(\d{1,2}):(\d{2})\b/u', $n, $m) && (int) $m[1] < 24) {
            $time = [(int) $m[1], (int) $m[2]];
            $this->rest = self::cut($this->rest, '(?:(?:à|a|vers)\s+)?'.$m[1].':'.$m[2]);
        } elseif (preg_match('/\bmidi\b/u', $n)) {
            $time = [12, 0];
            $this->rest = self::cut($this->rest, '(?:(?:à|a|vers)\s+)?midi');
        }
        if ($time && !$date) {
            $date = ($time[0] * 60 + $time[1] > (int) $now->format('G') * 60 + (int) $now->format('i')) ? $today : $today->modify('+1 day');
        }

        return [$date, $time];
    }

    /* -------------------------------------------------------------- outils */

    private static function unknown(string $text, string $hint): array
    {
        return ['action' => 'unknown', 'transcript' => $text, 'summary' => $hint, 'fields' => [], 'missing' => []];
    }

    /**
     * Cherche les mots d'un nom dans la phrase, en tolerant les fautes de transcription
     * (« Marseau » pour « Marceau ») : une lettre de difference par tranche de 5 lettres.
     * Rend les mots tels qu'ils ont ete dits, ou null.
     *
     * @param list<string> $words
     * @param list<string> $name
     */
    private static function findWords(array $words, array $name): ?string
    {
        $k = count($name);
        for ($i = 0; $i + $k <= count($words); $i++) {
            $ok = true;
            for ($j = 0; $j < $k && $ok; $j++) {
                $a = $words[$i + $j];
                $b = $name[$j];
                $ok = $a === $b || (strlen($b) >= 5 && levenshtein($a, $b) <= intdiv(strlen($b), 5));
            }
            if ($ok) {
                return implode(' ', array_slice($words, $i, $k));
            }
        }
        return null;
    }

    /** Minuscules sans accents ni ponctuation, pour comparer (les positions ne sont pas conservees). */
    public static function norm(string $s): string
    {
        $s = mb_strtolower($s);
        $s = strtr($s, ['à' => 'a', 'â' => 'a', 'ä' => 'a', 'ç' => 'c', 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e', 'î' => 'i', 'ï' => 'i', 'ô' => 'o', 'ö' => 'o', 'ù' => 'u', 'û' => 'u', 'ü' => 'u', 'ÿ' => 'y', 'œ' => 'oe', 'æ' => 'ae', '’' => ' ', "'" => ' ']);
        // Le trait d'union compte comme un espace : « Villa-Marceau » vaut « Villa Marceau ».
        $s = preg_replace('/[^a-z0-9: ]+/u', ' ', $s);
        return trim(preg_replace('/\s+/', ' ', $s));
    }

    /** Motif qui reconnait une expression avec ou sans accents ni majuscules. */
    private static function loose(string $label): string
    {
        $map = ['a' => '[aàâä]', 'c' => '[cç]', 'e' => '[eéèêë]', 'i' => '[iîï]', 'o' => '[oôö]', 'u' => '[uùûü]', 'y' => '[yÿ]'];
        $out = '';
        foreach (preg_split('//u', self::norm($label), -1, PREG_SPLIT_NO_EMPTY) as $ch) {
            $out .= $ch === ' ' ? '[\s’\'\-]+' : ($map[$ch] ?? preg_quote($ch, '/'));
        }
        return $out;
    }

    /** Retire la premiere occurrence d'une expression du texte, et les espaces en trop. */
    private static function cut(string $text, string $pattern): string
    {
        $out = preg_replace('/\s*\b'.$pattern.'\b/iu', '', $text, 1) ?? $text;
        return trim(preg_replace('/\s{2,}/u', ' ', $out), " ,");
    }

    private static function clean(string $s): string
    {
        $s = trim(preg_replace('/\s+/u', ' ', $s));
        // Formules de politesse et nom de l'assistant en tete.
        $s = preg_replace('/^(?:(?:ok|okay|ouais|bon|alors|euh|hey|salut|bonjour)\s*,?\s*)*(?:albert\s*,?\s*)?/iu', '', $s);
        $s = preg_replace('/\s*(?:,?\s*(?:s[’\']il (?:te|vous) pla[iî]t|stp|svp|merci))+[.!]?$/iu', '', $s);
        return trim($s, " .!");
    }

    private static function sentence(string $s): string
    {
        $s = trim($s);
        return $s === '' ? '' : mb_strtoupper(mb_substr($s, 0, 1)).mb_substr($s, 1);
    }

    /** Nom propre : « zazoun » devient « Zazoun », « m. dupont » devient « M. Dupont ». */
    private static function title(string $s): string
    {
        $s = trim($s, " ,.");
        return preg_replace_callback('/(^|[\s\-’\'])(\p{Ll})/u', fn ($m) => $m[1].mb_strtoupper($m[2]), $s) ?? $s;
    }

    private static function dayLabel(\DateTimeImmutable $d, \DateTimeImmutable $now): string
    {
        $diff = (int) $now->setTime(0, 0)->diff($d->setTime(0, 0))->format('%r%a');
        if ($diff === 0) {
            return 'aujourd’hui';
        }
        if ($diff === 1) {
            return 'demain';
        }
        $days = [1 => 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
        $months = [1 => 'janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
        return $days[(int) $d->format('N')].' '.$d->format('j').' '.$months[(int) $d->format('n')];
    }
}
