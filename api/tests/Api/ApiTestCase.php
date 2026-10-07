<?php

namespace App\Tests\Api;

use Symfony\Bundle\FrameworkBundle\Console\Application;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\Console\Input\ArrayInput;
use Symfony\Component\Console\Output\BufferedOutput;

/**
 * Tests d'API sur une vraie base PostgreSQL (albert_test) chargee avec les donnees de demonstration.
 * La base est remise a zero une fois par classe de test : schema par les migrations, puis fixtures.
 */
abstract class ApiTestCase extends WebTestCase
{
    protected KernelBrowser $client;
    /** @var array<string, string> jetons par numero */
    private static array $tokens = [];

    public static function setUpBeforeClass(): void
    {
        parent::setUpBeforeClass();
        $kernel = static::bootKernel();
        $app = new Application($kernel);
        $app->setAutoExit(false);
        foreach ([
            ['command' => 'doctrine:schema:drop', '--full-database' => true, '--force' => true],
            ['command' => 'doctrine:migrations:migrate', '--no-interaction' => true],
            ['command' => 'doctrine:fixtures:load', '--no-interaction' => true],
        ] as $cmd) {
            $out = new BufferedOutput();
            $code = $app->run(new ArrayInput($cmd + ['--quiet' => true]), $out);
            if ($code !== 0) {
                throw new \RuntimeException(sprintf('%s a echoue : %s', $cmd['command'], $out->fetch()));
            }
        }
        static::ensureKernelShutdown();
        self::$tokens = [];
    }

    protected function setUp(): void
    {
        $this->client = static::createClient();
    }

    /** Connexion par code SMS (le code est renvoye en environnement de test). */
    protected function login(string $phone): string
    {
        if (isset(self::$tokens[$phone])) {
            return self::$tokens[$phone];
        }
        $d = $this->json('POST', '/api/auth/request-code', null, ['phone' => $phone]);
        $d = $this->json('POST', '/api/auth/verify', null, ['phone' => $phone, 'code' => $d['devCode']]);
        return self::$tokens[$phone] = $d['token'];
    }

    /** Requete JSON ; renvoie le corps decode. Le statut est lisible via httpStatus(). */
    protected function json(string $method, string $path, ?string $token, ?array $body = null): mixed
    {
        $headers = ['HTTP_ACCEPT' => 'application/json', 'CONTENT_TYPE' => 'application/json'];
        if ($token) {
            $headers['HTTP_AUTHORIZATION'] = 'Bearer '.$token;
        }
        $this->client->request($method, $path, [], [], $headers, $body === null ? null : json_encode($body));
        $content = (string) $this->client->getResponse()->getContent();
        return $content === '' ? null : json_decode($content, true);
    }

    protected function httpStatus(): int
    {
        return $this->client->getResponse()->getStatusCode();
    }

    protected function siteId(string $token, string $name): string
    {
        foreach ($this->json('GET', '/api/sites', $token)['items'] as $s) {
            if ($s['name'] === $name) {
                return $s['id'];
            }
        }
        throw new \RuntimeException('Chantier introuvable : '.$name);
    }
}
