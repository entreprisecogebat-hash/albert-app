<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20261006135842 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Modules du CDC V3 : CRM, taches, agenda, pointage, fiches intervention, reserves et SAV, partage externe, DOE, phases de chantier';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql('CREATE TABLE appointment (id UUID NOT NULL, title VARCHAR(200) NOT NULL, starts_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL, ends_at TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT NULL, location VARCHAR(255) DEFAULT NULL, notes TEXT DEFAULT NULL, created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL, company_id UUID NOT NULL, site_id UUID DEFAULT NULL, contact_id UUID DEFAULT NULL, created_by_id UUID DEFAULT NULL, PRIMARY KEY (id))');
        $this->addSql('CREATE INDEX IDX_FE38F844979B1AD655A0507C ON appointment (company_id, starts_at)');
        $this->addSql('CREATE INDEX IDX_FE38F844979B1AD6 ON appointment (company_id)');
        $this->addSql('CREATE INDEX IDX_FE38F844F6BD1646 ON appointment (site_id)');
        $this->addSql('CREATE INDEX IDX_FE38F844E7A1254A ON appointment (contact_id)');
        $this->addSql('CREATE INDEX IDX_FE38F844B03A8386 ON appointment (created_by_id)');
        $this->addSql('CREATE TABLE contact (id UUID NOT NULL, kind VARCHAR(20) NOT NULL, name VARCHAR(160) NOT NULL, company_name VARCHAR(160) DEFAULT NULL, job_title VARCHAR(120) DEFAULT NULL, phone VARCHAR(40) DEFAULT NULL, email VARCHAR(180) DEFAULT NULL, address VARCHAR(255) DEFAULT NULL, notes TEXT DEFAULT NULL, created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL, updated_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL, company_id UUID NOT NULL, PRIMARY KEY (id))');
        $this->addSql('CREATE INDEX IDX_4C62E638979B1AD63BC4BCD9 ON contact (company_id, kind)');
        $this->addSql('CREATE INDEX IDX_4C62E638979B1AD6E7927C74 ON contact (company_id, email)');
        $this->addSql('CREATE INDEX IDX_4C62E638979B1AD6444F97DD ON contact (company_id, phone)');
        $this->addSql('CREATE INDEX IDX_4C62E638979B1AD6 ON contact (company_id)');
        $this->addSql('CREATE TABLE contact_site (contact_id UUID NOT NULL, site_id UUID NOT NULL, PRIMARY KEY (contact_id, site_id))');
        $this->addSql('CREATE INDEX IDX_41BC8B1BE7A1254A ON contact_site (contact_id)');
        $this->addSql('CREATE INDEX IDX_41BC8B1BF6BD1646 ON contact_site (site_id)');
        $this->addSql('CREATE TABLE intervention (id UUID NOT NULL, number VARCHAR(20) NOT NULL, intervention_on DATE NOT NULL, title VARCHAR(200) NOT NULL, work_done TEXT NOT NULL, materials TEXT DEFAULT NULL, minutes INT DEFAULT NULL, technicians VARCHAR(255) DEFAULT NULL, status VARCHAR(10) NOT NULL, signer_name VARCHAR(160) DEFAULT NULL, signed_at TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT NULL, signature_key VARCHAR(255) DEFAULT NULL, created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL, company_id UUID NOT NULL, site_id UUID NOT NULL, document_id UUID DEFAULT NULL, author_id UUID DEFAULT NULL, PRIMARY KEY (id))');
        $this->addSql('CREATE INDEX IDX_D11814ABF6BD1646382176FB ON intervention (site_id, intervention_on)');
        $this->addSql('CREATE UNIQUE INDEX UNIQ_D11814AB979B1AD696901F54 ON intervention (company_id, number)');
        $this->addSql('CREATE INDEX IDX_D11814AB979B1AD6 ON intervention (company_id)');
        $this->addSql('CREATE INDEX IDX_D11814ABF6BD1646 ON intervention (site_id)');
        $this->addSql('CREATE INDEX IDX_D11814ABC33F7837 ON intervention (document_id)');
        $this->addSql('CREATE INDEX IDX_D11814ABF675F31B ON intervention (author_id)');
        $this->addSql('CREATE TABLE reserve (id UUID NOT NULL, kind VARCHAR(10) NOT NULL, title VARCHAR(200) NOT NULL, description TEXT DEFAULT NULL, location VARCHAR(160) DEFAULT NULL, status VARCHAR(12) NOT NULL, reported_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL, due_on DATE DEFAULT NULL, done_at TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT NULL, visibility VARCHAR(10) NOT NULL, photo_ids JSON NOT NULL, company_id UUID NOT NULL, site_id UUID NOT NULL, reported_by_id UUID DEFAULT NULL, assignee_id UUID DEFAULT NULL, PRIMARY KEY (id))');
        $this->addSql('CREATE INDEX IDX_1FE0EA22F6BD16467B00651C ON reserve (site_id, status)');
        $this->addSql('CREATE INDEX IDX_1FE0EA22979B1AD6 ON reserve (company_id)');
        $this->addSql('CREATE INDEX IDX_1FE0EA22F6BD1646 ON reserve (site_id)');
        $this->addSql('CREATE INDEX IDX_1FE0EA2271CE806 ON reserve (reported_by_id)');
        $this->addSql('CREATE INDEX IDX_1FE0EA2259EC7D60 ON reserve (assignee_id)');
        $this->addSql('CREATE TABLE reserve_event (id UUID NOT NULL, at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL, status VARCHAR(12) DEFAULT NULL, note TEXT DEFAULT NULL, company_id UUID NOT NULL, reserve_id UUID NOT NULL, actor_id UUID DEFAULT NULL, PRIMARY KEY (id))');
        $this->addSql('CREATE INDEX IDX_5893380D5913AEBF6A57FD3C ON reserve_event (reserve_id, at)');
        $this->addSql('CREATE INDEX IDX_5893380D979B1AD6 ON reserve_event (company_id)');
        $this->addSql('CREATE INDEX IDX_5893380D5913AEBF ON reserve_event (reserve_id)');
        $this->addSql('CREATE INDEX IDX_5893380D10DAF24A ON reserve_event (actor_id)');
        $this->addSql('CREATE TABLE share_link (id UUID NOT NULL, token VARCHAR(64) NOT NULL, expires_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL, revoked_at TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT NULL, created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL, views INT NOT NULL, company_id UUID NOT NULL, document_id UUID NOT NULL, created_by_id UUID DEFAULT NULL, PRIMARY KEY (id))');
        $this->addSql('CREATE UNIQUE INDEX UNIQ_8B6B94685F37A13B ON share_link (token)');
        $this->addSql('CREATE INDEX IDX_8B6B9468979B1AD6 ON share_link (company_id)');
        $this->addSql('CREATE INDEX IDX_8B6B9468C33F7837 ON share_link (document_id)');
        $this->addSql('CREATE INDEX IDX_8B6B9468B03A8386 ON share_link (created_by_id)');
        $this->addSql('CREATE TABLE task (id UUID NOT NULL, title VARCHAR(200) NOT NULL, notes TEXT DEFAULT NULL, due_on DATE DEFAULT NULL, priority VARCHAR(10) NOT NULL, status VARCHAR(10) NOT NULL, created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL, done_at TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT NULL, company_id UUID NOT NULL, site_id UUID NOT NULL, assignee_id UUID DEFAULT NULL, created_by_id UUID DEFAULT NULL, PRIMARY KEY (id))');
        $this->addSql('CREATE INDEX IDX_527EDB25F6BD16467B00651C ON task (site_id, status)');
        $this->addSql('CREATE INDEX IDX_527EDB2559EC7D607B00651C ON task (assignee_id, status)');
        $this->addSql('CREATE INDEX IDX_527EDB25979B1AD6 ON task (company_id)');
        $this->addSql('CREATE INDEX IDX_527EDB25F6BD1646 ON task (site_id)');
        $this->addSql('CREATE INDEX IDX_527EDB2559EC7D60 ON task (assignee_id)');
        $this->addSql('CREATE INDEX IDX_527EDB25B03A8386 ON task (created_by_id)');
        $this->addSql('CREATE TABLE time_entry (id UUID NOT NULL, started_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL, ended_at TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT NULL, start_latitude DOUBLE PRECISION DEFAULT NULL, start_longitude DOUBLE PRECISION DEFAULT NULL, start_accuracy DOUBLE PRECISION DEFAULT NULL, start_distance INT DEFAULT NULL, end_latitude DOUBLE PRECISION DEFAULT NULL, end_longitude DOUBLE PRECISION DEFAULT NULL, note TEXT DEFAULT NULL, client_id UUID DEFAULT NULL, end_client_id UUID DEFAULT NULL, company_id UUID NOT NULL, site_id UUID NOT NULL, user_id UUID NOT NULL, PRIMARY KEY (id))');
        $this->addSql('CREATE UNIQUE INDEX UNIQ_6E537C0C19EB6921 ON time_entry (client_id)');
        $this->addSql('CREATE UNIQUE INDEX UNIQ_6E537C0C8A3BD529 ON time_entry (end_client_id)');
        $this->addSql('CREATE INDEX IDX_6E537C0CA76ED395D46F4E3 ON time_entry (user_id, started_at)');
        $this->addSql('CREATE INDEX IDX_6E537C0CF6BD1646D46F4E3 ON time_entry (site_id, started_at)');
        $this->addSql('CREATE INDEX IDX_6E537C0C979B1AD6 ON time_entry (company_id)');
        $this->addSql('CREATE INDEX IDX_6E537C0CF6BD1646 ON time_entry (site_id)');
        $this->addSql('CREATE INDEX IDX_6E537C0CA76ED395 ON time_entry (user_id)');
        $this->addSql('ALTER TABLE appointment ADD CONSTRAINT FK_FE38F844979B1AD6 FOREIGN KEY (company_id) REFERENCES company (id) ON DELETE CASCADE NOT DEFERRABLE');
        $this->addSql('ALTER TABLE appointment ADD CONSTRAINT FK_FE38F844F6BD1646 FOREIGN KEY (site_id) REFERENCES site (id) ON DELETE CASCADE NOT DEFERRABLE');
        $this->addSql('ALTER TABLE appointment ADD CONSTRAINT FK_FE38F844E7A1254A FOREIGN KEY (contact_id) REFERENCES contact (id) ON DELETE SET NULL NOT DEFERRABLE');
        $this->addSql('ALTER TABLE appointment ADD CONSTRAINT FK_FE38F844B03A8386 FOREIGN KEY (created_by_id) REFERENCES app_user (id) ON DELETE SET NULL NOT DEFERRABLE');
        $this->addSql('ALTER TABLE contact ADD CONSTRAINT FK_4C62E638979B1AD6 FOREIGN KEY (company_id) REFERENCES company (id) ON DELETE CASCADE NOT DEFERRABLE');
        $this->addSql('ALTER TABLE contact_site ADD CONSTRAINT FK_41BC8B1BE7A1254A FOREIGN KEY (contact_id) REFERENCES contact (id) ON DELETE CASCADE NOT DEFERRABLE');
        $this->addSql('ALTER TABLE contact_site ADD CONSTRAINT FK_41BC8B1BF6BD1646 FOREIGN KEY (site_id) REFERENCES site (id) ON DELETE CASCADE NOT DEFERRABLE');
        $this->addSql('ALTER TABLE intervention ADD CONSTRAINT FK_D11814AB979B1AD6 FOREIGN KEY (company_id) REFERENCES company (id) ON DELETE CASCADE NOT DEFERRABLE');
        $this->addSql('ALTER TABLE intervention ADD CONSTRAINT FK_D11814ABF6BD1646 FOREIGN KEY (site_id) REFERENCES site (id) ON DELETE CASCADE NOT DEFERRABLE');
        $this->addSql('ALTER TABLE intervention ADD CONSTRAINT FK_D11814ABC33F7837 FOREIGN KEY (document_id) REFERENCES document (id) ON DELETE SET NULL NOT DEFERRABLE');
        $this->addSql('ALTER TABLE intervention ADD CONSTRAINT FK_D11814ABF675F31B FOREIGN KEY (author_id) REFERENCES app_user (id) ON DELETE SET NULL NOT DEFERRABLE');
        $this->addSql('ALTER TABLE reserve ADD CONSTRAINT FK_1FE0EA22979B1AD6 FOREIGN KEY (company_id) REFERENCES company (id) ON DELETE CASCADE NOT DEFERRABLE');
        $this->addSql('ALTER TABLE reserve ADD CONSTRAINT FK_1FE0EA22F6BD1646 FOREIGN KEY (site_id) REFERENCES site (id) ON DELETE CASCADE NOT DEFERRABLE');
        $this->addSql('ALTER TABLE reserve ADD CONSTRAINT FK_1FE0EA2271CE806 FOREIGN KEY (reported_by_id) REFERENCES app_user (id) ON DELETE SET NULL NOT DEFERRABLE');
        $this->addSql('ALTER TABLE reserve ADD CONSTRAINT FK_1FE0EA2259EC7D60 FOREIGN KEY (assignee_id) REFERENCES app_user (id) ON DELETE SET NULL NOT DEFERRABLE');
        $this->addSql('ALTER TABLE reserve_event ADD CONSTRAINT FK_5893380D979B1AD6 FOREIGN KEY (company_id) REFERENCES company (id) ON DELETE CASCADE NOT DEFERRABLE');
        $this->addSql('ALTER TABLE reserve_event ADD CONSTRAINT FK_5893380D5913AEBF FOREIGN KEY (reserve_id) REFERENCES reserve (id) ON DELETE CASCADE NOT DEFERRABLE');
        $this->addSql('ALTER TABLE reserve_event ADD CONSTRAINT FK_5893380D10DAF24A FOREIGN KEY (actor_id) REFERENCES app_user (id) ON DELETE SET NULL NOT DEFERRABLE');
        $this->addSql('ALTER TABLE share_link ADD CONSTRAINT FK_8B6B9468979B1AD6 FOREIGN KEY (company_id) REFERENCES company (id) ON DELETE CASCADE NOT DEFERRABLE');
        $this->addSql('ALTER TABLE share_link ADD CONSTRAINT FK_8B6B9468C33F7837 FOREIGN KEY (document_id) REFERENCES document (id) ON DELETE CASCADE NOT DEFERRABLE');
        $this->addSql('ALTER TABLE share_link ADD CONSTRAINT FK_8B6B9468B03A8386 FOREIGN KEY (created_by_id) REFERENCES app_user (id) ON DELETE SET NULL NOT DEFERRABLE');
        $this->addSql('ALTER TABLE task ADD CONSTRAINT FK_527EDB25979B1AD6 FOREIGN KEY (company_id) REFERENCES company (id) ON DELETE CASCADE NOT DEFERRABLE');
        $this->addSql('ALTER TABLE task ADD CONSTRAINT FK_527EDB25F6BD1646 FOREIGN KEY (site_id) REFERENCES site (id) ON DELETE CASCADE NOT DEFERRABLE');
        $this->addSql('ALTER TABLE task ADD CONSTRAINT FK_527EDB2559EC7D60 FOREIGN KEY (assignee_id) REFERENCES app_user (id) ON DELETE SET NULL NOT DEFERRABLE');
        $this->addSql('ALTER TABLE task ADD CONSTRAINT FK_527EDB25B03A8386 FOREIGN KEY (created_by_id) REFERENCES app_user (id) ON DELETE SET NULL NOT DEFERRABLE');
        $this->addSql('ALTER TABLE time_entry ADD CONSTRAINT FK_6E537C0C979B1AD6 FOREIGN KEY (company_id) REFERENCES company (id) ON DELETE CASCADE NOT DEFERRABLE');
        $this->addSql('ALTER TABLE time_entry ADD CONSTRAINT FK_6E537C0CF6BD1646 FOREIGN KEY (site_id) REFERENCES site (id) ON DELETE CASCADE NOT DEFERRABLE');
        $this->addSql('ALTER TABLE time_entry ADD CONSTRAINT FK_6E537C0CA76ED395 FOREIGN KEY (user_id) REFERENCES app_user (id) ON DELETE CASCADE NOT DEFERRABLE');
        $this->addSql('ALTER TABLE document ADD contact_id UUID DEFAULT NULL');
        $this->addSql('ALTER TABLE document ADD CONSTRAINT FK_D8698A76E7A1254A FOREIGN KEY (contact_id) REFERENCES contact (id) ON DELETE SET NULL NOT DEFERRABLE');
        $this->addSql('CREATE INDEX IDX_D8698A76E7A1254A ON document (contact_id)');
        $this->addSql('ALTER TABLE site ADD phase VARCHAR(10) DEFAULT \'pendant\' NOT NULL');
        $this->addSql('ALTER TABLE site ADD delivered_on DATE DEFAULT NULL');
        $this->addSql('ALTER TABLE site ADD doe_document_id UUID DEFAULT NULL');
        $this->addSql('ALTER TABLE site ADD doe_zip_key VARCHAR(255) DEFAULT NULL');
        $this->addSql('ALTER TABLE site ADD doe_generated_at TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql('ALTER TABLE appointment DROP CONSTRAINT FK_FE38F844979B1AD6');
        $this->addSql('ALTER TABLE appointment DROP CONSTRAINT FK_FE38F844F6BD1646');
        $this->addSql('ALTER TABLE appointment DROP CONSTRAINT FK_FE38F844E7A1254A');
        $this->addSql('ALTER TABLE appointment DROP CONSTRAINT FK_FE38F844B03A8386');
        $this->addSql('ALTER TABLE contact DROP CONSTRAINT FK_4C62E638979B1AD6');
        $this->addSql('ALTER TABLE contact_site DROP CONSTRAINT FK_41BC8B1BE7A1254A');
        $this->addSql('ALTER TABLE contact_site DROP CONSTRAINT FK_41BC8B1BF6BD1646');
        $this->addSql('ALTER TABLE intervention DROP CONSTRAINT FK_D11814AB979B1AD6');
        $this->addSql('ALTER TABLE intervention DROP CONSTRAINT FK_D11814ABF6BD1646');
        $this->addSql('ALTER TABLE intervention DROP CONSTRAINT FK_D11814ABC33F7837');
        $this->addSql('ALTER TABLE intervention DROP CONSTRAINT FK_D11814ABF675F31B');
        $this->addSql('ALTER TABLE reserve DROP CONSTRAINT FK_1FE0EA22979B1AD6');
        $this->addSql('ALTER TABLE reserve DROP CONSTRAINT FK_1FE0EA22F6BD1646');
        $this->addSql('ALTER TABLE reserve DROP CONSTRAINT FK_1FE0EA2271CE806');
        $this->addSql('ALTER TABLE reserve DROP CONSTRAINT FK_1FE0EA2259EC7D60');
        $this->addSql('ALTER TABLE reserve_event DROP CONSTRAINT FK_5893380D979B1AD6');
        $this->addSql('ALTER TABLE reserve_event DROP CONSTRAINT FK_5893380D5913AEBF');
        $this->addSql('ALTER TABLE reserve_event DROP CONSTRAINT FK_5893380D10DAF24A');
        $this->addSql('ALTER TABLE share_link DROP CONSTRAINT FK_8B6B9468979B1AD6');
        $this->addSql('ALTER TABLE share_link DROP CONSTRAINT FK_8B6B9468C33F7837');
        $this->addSql('ALTER TABLE share_link DROP CONSTRAINT FK_8B6B9468B03A8386');
        $this->addSql('ALTER TABLE task DROP CONSTRAINT FK_527EDB25979B1AD6');
        $this->addSql('ALTER TABLE task DROP CONSTRAINT FK_527EDB25F6BD1646');
        $this->addSql('ALTER TABLE task DROP CONSTRAINT FK_527EDB2559EC7D60');
        $this->addSql('ALTER TABLE task DROP CONSTRAINT FK_527EDB25B03A8386');
        $this->addSql('ALTER TABLE time_entry DROP CONSTRAINT FK_6E537C0C979B1AD6');
        $this->addSql('ALTER TABLE time_entry DROP CONSTRAINT FK_6E537C0CF6BD1646');
        $this->addSql('ALTER TABLE time_entry DROP CONSTRAINT FK_6E537C0CA76ED395');
        $this->addSql('DROP TABLE appointment');
        $this->addSql('DROP TABLE contact');
        $this->addSql('DROP TABLE contact_site');
        $this->addSql('DROP TABLE intervention');
        $this->addSql('DROP TABLE reserve');
        $this->addSql('DROP TABLE reserve_event');
        $this->addSql('DROP TABLE share_link');
        $this->addSql('DROP TABLE task');
        $this->addSql('DROP TABLE time_entry');
        $this->addSql('ALTER TABLE document DROP CONSTRAINT FK_D8698A76E7A1254A');
        $this->addSql('DROP INDEX IDX_D8698A76E7A1254A');
        $this->addSql('ALTER TABLE document DROP contact_id');
        $this->addSql('ALTER TABLE site DROP phase');
        $this->addSql('ALTER TABLE site DROP delivered_on');
        $this->addSql('ALTER TABLE site DROP doe_document_id');
        $this->addSql('ALTER TABLE site DROP doe_zip_key');
        $this->addSql('ALTER TABLE site DROP doe_generated_at');
    }
}
