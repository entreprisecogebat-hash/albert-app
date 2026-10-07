<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20261006144103 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Finances : devis, factures, dépenses, paiements, relances, numérotation';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql('CREATE TABLE finance_entry (id UUID NOT NULL, kind VARCHAR(10) NOT NULL, number VARCHAR(60) DEFAULT NULL, title VARCHAR(200) NOT NULL, status VARCHAR(16) NOT NULL, category VARCHAR(20) DEFAULT NULL, amount_ht BIGINT NOT NULL, vat_rate INT NOT NULL, amount_vat BIGINT NOT NULL, amount_ttc BIGINT NOT NULL, paid BIGINT NOT NULL, issued_on DATE DEFAULT NULL, due_on DATE DEFAULT NULL, notes TEXT DEFAULT NULL, reminders_count INT NOT NULL, last_reminder_at TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT NULL, sent_at TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT NULL, created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL, updated_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL, company_id UUID NOT NULL, site_id UUID NOT NULL, contact_id UUID DEFAULT NULL, document_id UUID DEFAULT NULL, quote_id UUID DEFAULT NULL, created_by_id UUID DEFAULT NULL, PRIMARY KEY (id))');
        $this->addSql('CREATE INDEX IDX_2B8E898BF6BD16463BC4BCD9 ON finance_entry (site_id, kind)');
        $this->addSql('CREATE INDEX IDX_2B8E898B979B1AD63BC4BCD97B00651C ON finance_entry (company_id, kind, status)');
        $this->addSql('CREATE UNIQUE INDEX finance_number_unique ON finance_entry (company_id, kind, number) WHERE kind IN (\'devis\', \'facture\') AND number IS NOT NULL');
        $this->addSql('CREATE INDEX IDX_2B8E898B979B1AD6 ON finance_entry (company_id)');
        $this->addSql('CREATE INDEX IDX_2B8E898BF6BD1646 ON finance_entry (site_id)');
        $this->addSql('CREATE INDEX IDX_2B8E898BE7A1254A ON finance_entry (contact_id)');
        $this->addSql('CREATE INDEX IDX_2B8E898BC33F7837 ON finance_entry (document_id)');
        $this->addSql('CREATE INDEX IDX_2B8E898BDB805178 ON finance_entry (quote_id)');
        $this->addSql('CREATE INDEX IDX_2B8E898BB03A8386 ON finance_entry (created_by_id)');
        $this->addSql('CREATE TABLE finance_payment (id UUID NOT NULL, amount BIGINT NOT NULL, paid_on DATE NOT NULL, method VARCHAR(10) NOT NULL, note VARCHAR(500) DEFAULT NULL, created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL, company_id UUID NOT NULL, entry_id UUID NOT NULL, created_by_id UUID DEFAULT NULL, PRIMARY KEY (id))');
        $this->addSql('CREATE INDEX IDX_80BA68A9BA364942 ON finance_payment (entry_id)');
        $this->addSql('CREATE INDEX IDX_80BA68A9979B1AD6 ON finance_payment (company_id)');
        $this->addSql('CREATE INDEX IDX_80BA68A9B03A8386 ON finance_payment (created_by_id)');
        $this->addSql('CREATE TABLE finance_reminder (id UUID NOT NULL, at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL, channel VARCHAR(10) NOT NULL, note VARCHAR(1000) DEFAULT NULL, company_id UUID NOT NULL, entry_id UUID NOT NULL, by_id UUID DEFAULT NULL, PRIMARY KEY (id))');
        $this->addSql('CREATE INDEX IDX_9161BA5DBA364942 ON finance_reminder (entry_id)');
        $this->addSql('CREATE INDEX IDX_9161BA5D979B1AD6 ON finance_reminder (company_id)');
        $this->addSql('CREATE INDEX IDX_9161BA5DAAE72004 ON finance_reminder (by_id)');
        $this->addSql('CREATE TABLE finance_sequence (id UUID NOT NULL, prefix VARCHAR(12) NOT NULL, last INT NOT NULL, company_id UUID NOT NULL, PRIMARY KEY (id))');
        $this->addSql('CREATE UNIQUE INDEX UNIQ_83D02236979B1AD693B1868E ON finance_sequence (company_id, prefix)');
        $this->addSql('CREATE INDEX IDX_83D02236979B1AD6 ON finance_sequence (company_id)');
        $this->addSql('ALTER TABLE finance_entry ADD CONSTRAINT FK_2B8E898B979B1AD6 FOREIGN KEY (company_id) REFERENCES company (id) ON DELETE CASCADE NOT DEFERRABLE');
        $this->addSql('ALTER TABLE finance_entry ADD CONSTRAINT FK_2B8E898BF6BD1646 FOREIGN KEY (site_id) REFERENCES site (id) ON DELETE CASCADE NOT DEFERRABLE');
        $this->addSql('ALTER TABLE finance_entry ADD CONSTRAINT FK_2B8E898BE7A1254A FOREIGN KEY (contact_id) REFERENCES contact (id) ON DELETE SET NULL NOT DEFERRABLE');
        $this->addSql('ALTER TABLE finance_entry ADD CONSTRAINT FK_2B8E898BC33F7837 FOREIGN KEY (document_id) REFERENCES document (id) ON DELETE SET NULL NOT DEFERRABLE');
        $this->addSql('ALTER TABLE finance_entry ADD CONSTRAINT FK_2B8E898BDB805178 FOREIGN KEY (quote_id) REFERENCES finance_entry (id) ON DELETE SET NULL NOT DEFERRABLE');
        $this->addSql('ALTER TABLE finance_entry ADD CONSTRAINT FK_2B8E898BB03A8386 FOREIGN KEY (created_by_id) REFERENCES app_user (id) ON DELETE SET NULL NOT DEFERRABLE');
        $this->addSql('ALTER TABLE finance_payment ADD CONSTRAINT FK_80BA68A9979B1AD6 FOREIGN KEY (company_id) REFERENCES company (id) ON DELETE CASCADE NOT DEFERRABLE');
        $this->addSql('ALTER TABLE finance_payment ADD CONSTRAINT FK_80BA68A9BA364942 FOREIGN KEY (entry_id) REFERENCES finance_entry (id) ON DELETE CASCADE NOT DEFERRABLE');
        $this->addSql('ALTER TABLE finance_payment ADD CONSTRAINT FK_80BA68A9B03A8386 FOREIGN KEY (created_by_id) REFERENCES app_user (id) ON DELETE SET NULL NOT DEFERRABLE');
        $this->addSql('ALTER TABLE finance_reminder ADD CONSTRAINT FK_9161BA5D979B1AD6 FOREIGN KEY (company_id) REFERENCES company (id) ON DELETE CASCADE NOT DEFERRABLE');
        $this->addSql('ALTER TABLE finance_reminder ADD CONSTRAINT FK_9161BA5DBA364942 FOREIGN KEY (entry_id) REFERENCES finance_entry (id) ON DELETE CASCADE NOT DEFERRABLE');
        $this->addSql('ALTER TABLE finance_reminder ADD CONSTRAINT FK_9161BA5DAAE72004 FOREIGN KEY (by_id) REFERENCES app_user (id) ON DELETE SET NULL NOT DEFERRABLE');
        $this->addSql('ALTER TABLE finance_sequence ADD CONSTRAINT FK_83D02236979B1AD6 FOREIGN KEY (company_id) REFERENCES company (id) ON DELETE CASCADE NOT DEFERRABLE');
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql('ALTER TABLE finance_entry DROP CONSTRAINT FK_2B8E898B979B1AD6');
        $this->addSql('ALTER TABLE finance_entry DROP CONSTRAINT FK_2B8E898BF6BD1646');
        $this->addSql('ALTER TABLE finance_entry DROP CONSTRAINT FK_2B8E898BE7A1254A');
        $this->addSql('ALTER TABLE finance_entry DROP CONSTRAINT FK_2B8E898BC33F7837');
        $this->addSql('ALTER TABLE finance_entry DROP CONSTRAINT FK_2B8E898BDB805178');
        $this->addSql('ALTER TABLE finance_entry DROP CONSTRAINT FK_2B8E898BB03A8386');
        $this->addSql('ALTER TABLE finance_payment DROP CONSTRAINT FK_80BA68A9979B1AD6');
        $this->addSql('ALTER TABLE finance_payment DROP CONSTRAINT FK_80BA68A9BA364942');
        $this->addSql('ALTER TABLE finance_payment DROP CONSTRAINT FK_80BA68A9B03A8386');
        $this->addSql('ALTER TABLE finance_reminder DROP CONSTRAINT FK_9161BA5D979B1AD6');
        $this->addSql('ALTER TABLE finance_reminder DROP CONSTRAINT FK_9161BA5DBA364942');
        $this->addSql('ALTER TABLE finance_reminder DROP CONSTRAINT FK_9161BA5DAAE72004');
        $this->addSql('ALTER TABLE finance_sequence DROP CONSTRAINT FK_83D02236979B1AD6');
        $this->addSql('DROP TABLE finance_entry');
        $this->addSql('DROP TABLE finance_payment');
        $this->addSql('DROP TABLE finance_reminder');
        $this->addSql('DROP TABLE finance_sequence');
    }
}
