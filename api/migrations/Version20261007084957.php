<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20261007084957 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Notes vocales : fichier audio joint aux messages.';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE message ADD audio_key VARCHAR(255) DEFAULT NULL');
        $this->addSql('ALTER TABLE message ADD audio_mime VARCHAR(60) DEFAULT NULL');
        $this->addSql('ALTER TABLE message ADD audio_duration_ms INT DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE message DROP audio_key');
        $this->addSql('ALTER TABLE message DROP audio_mime');
        $this->addSql('ALTER TABLE message DROP audio_duration_ms');
    }
}
