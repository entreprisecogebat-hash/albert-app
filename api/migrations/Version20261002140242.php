<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20261002140242 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql('CREATE TABLE activity_event (id UUID NOT NULL, type VARCHAR(30) NOT NULL, title VARCHAR(255) NOT NULL, subtitle VARCHAR(500) DEFAULT NULL, payload JSON NOT NULL, visibility VARCHAR(10) NOT NULL, occurred_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL, recorded_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL, group_key VARCHAR(80) DEFAULT NULL, document_ref UUID DEFAULT NULL, company_id UUID NOT NULL, site_id UUID NOT NULL, actor_id UUID DEFAULT NULL, PRIMARY KEY (id))');
        $this->addSql('CREATE UNIQUE INDEX UNIQ_25AC3C1490243D0 ON activity_event (group_key)');
        $this->addSql('CREATE INDEX IDX_25AC3C14F6BD164687C03D1B ON activity_event (site_id, occurred_at)');
        $this->addSql('CREATE INDEX IDX_25AC3C14C7C5CC47 ON activity_event (document_ref)');
        $this->addSql('CREATE INDEX IDX_25AC3C14979B1AD6 ON activity_event (company_id)');
        $this->addSql('CREATE INDEX IDX_25AC3C14F6BD1646 ON activity_event (site_id)');
        $this->addSql('CREATE INDEX IDX_25AC3C1410DAF24A ON activity_event (actor_id)');
        $this->addSql('CREATE TABLE api_token (id UUID NOT NULL, token_hash VARCHAR(64) NOT NULL, device_name VARCHAR(120) DEFAULT NULL, created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL, expires_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL, last_used_at TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT NULL, user_id UUID NOT NULL, PRIMARY KEY (id))');
        $this->addSql('CREATE UNIQUE INDEX UNIQ_7BA2F5EBB3BC57DA ON api_token (token_hash)');
        $this->addSql('CREATE INDEX IDX_7BA2F5EBA76ED395 ON api_token (user_id)');
        $this->addSql('CREATE TABLE app_user (id UUID NOT NULL, phone VARCHAR(20) NOT NULL, first_name VARCHAR(80) NOT NULL, last_name VARCHAR(80) NOT NULL, job_title VARCHAR(120) DEFAULT NULL, kind VARCHAR(10) NOT NULL, admin BOOLEAN NOT NULL, active BOOLEAN NOT NULL, created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL, last_login_at TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT NULL, company_id UUID NOT NULL, PRIMARY KEY (id))');
        $this->addSql('CREATE UNIQUE INDEX UNIQ_88BDF3E9444F97DD ON app_user (phone)');
        $this->addSql('CREATE INDEX IDX_88BDF3E9979B1AD6 ON app_user (company_id)');
        $this->addSql('CREATE TABLE channel (id UUID NOT NULL, kind VARCHAR(10) NOT NULL, awaiting_reply BOOLEAN NOT NULL, last_message_at TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT NULL, company_id UUID NOT NULL, site_id UUID NOT NULL, PRIMARY KEY (id))');
        $this->addSql('CREATE UNIQUE INDEX UNIQ_A2F98E47F6BD16463BC4BCD9 ON channel (site_id, kind)');
        $this->addSql('CREATE INDEX IDX_A2F98E47979B1AD6 ON channel (company_id)');
        $this->addSql('CREATE INDEX IDX_A2F98E47F6BD1646 ON channel (site_id)');
        $this->addSql('CREATE TABLE classification_rule (id UUID NOT NULL, pattern VARCHAR(255) NOT NULL, type VARCHAR(20) NOT NULL, folder_kind VARCHAR(30) NOT NULL, priority INT NOT NULL, source VARCHAR(10) NOT NULL, hits INT NOT NULL, created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL, company_id UUID NOT NULL, PRIMARY KEY (id))');
        $this->addSql('CREATE INDEX IDX_C26DA372979B1AD6 ON classification_rule (company_id)');
        $this->addSql('CREATE TABLE company (id UUID NOT NULL, name VARCHAR(120) NOT NULL, slug VARCHAR(80) NOT NULL, folder_template JSON NOT NULL, ai_enabled BOOLEAN NOT NULL, created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL, PRIMARY KEY (id))');
        $this->addSql('CREATE UNIQUE INDEX UNIQ_4FBF094F989D9B62 ON company (slug)');
        $this->addSql('CREATE TABLE device_token (id UUID NOT NULL, token VARCHAR(255) NOT NULL, platform VARCHAR(10) NOT NULL, updated_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL, company_id UUID NOT NULL, user_id UUID NOT NULL, PRIMARY KEY (id))');
        $this->addSql('CREATE UNIQUE INDEX UNIQ_99B2415C5F37A13B ON device_token (token)');
        $this->addSql('CREATE INDEX IDX_99B2415C979B1AD6 ON device_token (company_id)');
        $this->addSql('CREATE INDEX IDX_99B2415CA76ED395 ON device_token (user_id)');
        $this->addSql('CREATE TABLE document (id UUID NOT NULL, title VARCHAR(200) NOT NULL, normalized_title VARCHAR(200) NOT NULL, type VARCHAR(20) NOT NULL, visibility VARCHAR(10) NOT NULL, versions_count INT NOT NULL, classified_by VARCHAR(12) NOT NULL, created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL, updated_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL, company_id UUID NOT NULL, site_id UUID NOT NULL, folder_id UUID NOT NULL, current_version_id UUID DEFAULT NULL, created_by_id UUID DEFAULT NULL, PRIMARY KEY (id))');
        $this->addSql('CREATE UNIQUE INDEX UNIQ_D8698A769407EE77 ON document (current_version_id)');
        $this->addSql('CREATE INDEX IDX_D8698A76F6BD164643625D9F ON document (site_id, updated_at)');
        $this->addSql('CREATE INDEX IDX_D8698A76F6BD1646F768CADB ON document (site_id, normalized_title)');
        $this->addSql('CREATE INDEX IDX_D8698A76979B1AD6 ON document (company_id)');
        $this->addSql('CREATE INDEX IDX_D8698A76F6BD1646 ON document (site_id)');
        $this->addSql('CREATE INDEX IDX_D8698A76162CB942 ON document (folder_id)');
        $this->addSql('CREATE INDEX IDX_D8698A76B03A8386 ON document (created_by_id)');
        $this->addSql('CREATE TABLE document_version (id UUID NOT NULL, number INT NOT NULL, label VARCHAR(20) NOT NULL, file_key VARCHAR(255) NOT NULL, original_name VARCHAR(255) NOT NULL, mime_type VARCHAR(120) NOT NULL, size BIGINT NOT NULL, sha256 VARCHAR(64) NOT NULL, comment TEXT DEFAULT NULL, uploaded_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL, client_id UUID DEFAULT NULL, company_id UUID NOT NULL, document_id UUID NOT NULL, uploaded_by_id UUID DEFAULT NULL, PRIMARY KEY (id))');
        $this->addSql('CREATE UNIQUE INDEX UNIQ_1B73751F19EB6921 ON document_version (client_id)');
        $this->addSql('CREATE INDEX IDX_1B73751F979B1AD65CC814F7 ON document_version (company_id, sha256)');
        $this->addSql('CREATE INDEX IDX_1B73751F979B1AD6 ON document_version (company_id)');
        $this->addSql('CREATE INDEX IDX_1B73751FC33F7837 ON document_version (document_id)');
        $this->addSql('CREATE INDEX IDX_1B73751FA2B28FE8 ON document_version (uploaded_by_id)');
        $this->addSql('CREATE TABLE folder (id UUID NOT NULL, name VARCHAR(120) NOT NULL, kind VARCHAR(30) NOT NULL, position INT NOT NULL, company_id UUID NOT NULL, site_id UUID NOT NULL, parent_id UUID DEFAULT NULL, PRIMARY KEY (id))');
        $this->addSql('CREATE INDEX IDX_ECA209CDF6BD1646 ON folder (site_id)');
        $this->addSql('CREATE INDEX IDX_ECA209CD979B1AD6 ON folder (company_id)');
        $this->addSql('CREATE INDEX IDX_ECA209CD727ACA70 ON folder (parent_id)');
        $this->addSql('CREATE TABLE login_code (id UUID NOT NULL, phone VARCHAR(20) NOT NULL, code_hash VARCHAR(255) NOT NULL, expires_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL, attempts INT NOT NULL, consumed_at TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT NULL, created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL, PRIMARY KEY (id))');
        $this->addSql('CREATE INDEX IDX_B167BBDD444F97DD ON login_code (phone)');
        $this->addSql('CREATE TABLE message (id UUID NOT NULL, body TEXT NOT NULL, created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL, received_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL, client_id UUID DEFAULT NULL, company_id UUID NOT NULL, channel_id UUID NOT NULL, author_id UUID DEFAULT NULL, PRIMARY KEY (id))');
        $this->addSql('CREATE UNIQUE INDEX UNIQ_B6BD307F19EB6921 ON message (client_id)');
        $this->addSql('CREATE INDEX IDX_B6BD307F72F5A1AA8B8E8428 ON message (channel_id, created_at)');
        $this->addSql('CREATE INDEX IDX_B6BD307F979B1AD6 ON message (company_id)');
        $this->addSql('CREATE INDEX IDX_B6BD307F72F5A1AA ON message (channel_id)');
        $this->addSql('CREATE INDEX IDX_B6BD307FF675F31B ON message (author_id)');
        $this->addSql('CREATE TABLE notification (id UUID NOT NULL, type VARCHAR(30) NOT NULL, title VARCHAR(160) NOT NULL, body VARCHAR(255) NOT NULL, link VARCHAR(255) DEFAULT NULL, read_at TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT NULL, created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL, company_id UUID NOT NULL, user_id UUID NOT NULL, site_id UUID DEFAULT NULL, PRIMARY KEY (id))');
        $this->addSql('CREATE INDEX IDX_BF5476CAA76ED3958B8E8428 ON notification (user_id, created_at)');
        $this->addSql('CREATE INDEX IDX_BF5476CA979B1AD6 ON notification (company_id)');
        $this->addSql('CREATE INDEX IDX_BF5476CAA76ED395 ON notification (user_id)');
        $this->addSql('CREATE INDEX IDX_BF5476CAF6BD1646 ON notification (site_id)');
        $this->addSql('CREATE TABLE photo (id UUID NOT NULL, batch_id UUID NOT NULL, file_key VARCHAR(255) NOT NULL, thumb_key VARCHAR(255) DEFAULT NULL, mime_type VARCHAR(60) NOT NULL, size BIGINT NOT NULL, sha256 VARCHAR(64) NOT NULL, width INT DEFAULT NULL, height INT DEFAULT NULL, taken_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL, latitude DOUBLE PRECISION DEFAULT NULL, longitude DOUBLE PRECISION DEFAULT NULL, accuracy DOUBLE PRECISION DEFAULT NULL, caption VARCHAR(255) DEFAULT NULL, visibility VARCHAR(10) NOT NULL, uploaded_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL, client_id UUID DEFAULT NULL, company_id UUID NOT NULL, site_id UUID NOT NULL, uploaded_by_id UUID DEFAULT NULL, PRIMARY KEY (id))');
        $this->addSql('CREATE UNIQUE INDEX UNIQ_14B7841819EB6921 ON photo (client_id)');
        $this->addSql('CREATE INDEX IDX_14B78418F6BD1646C48F0688 ON photo (site_id, taken_at)');
        $this->addSql('CREATE INDEX IDX_14B78418F39EBE7A ON photo (batch_id)');
        $this->addSql('CREATE INDEX IDX_14B78418979B1AD6 ON photo (company_id)');
        $this->addSql('CREATE INDEX IDX_14B78418F6BD1646 ON photo (site_id)');
        $this->addSql('CREATE INDEX IDX_14B78418A2B28FE8 ON photo (uploaded_by_id)');
        $this->addSql('CREATE TABLE site (id UUID NOT NULL, name VARCHAR(160) NOT NULL, address VARCHAR(255) NOT NULL, reference VARCHAR(40) DEFAULT NULL, client_name VARCHAR(160) DEFAULT NULL, started_on DATE DEFAULT NULL, latitude DOUBLE PRECISION DEFAULT NULL, longitude DOUBLE PRECISION DEFAULT NULL, status VARCHAR(10) NOT NULL, created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL, last_activity_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL, company_id UUID NOT NULL, PRIMARY KEY (id))');
        $this->addSql('CREATE INDEX IDX_694309E4979B1AD67B00651C ON site (company_id, status)');
        $this->addSql('CREATE INDEX IDX_694309E4979B1AD6 ON site (company_id)');
        $this->addSql('CREATE TABLE site_member (id UUID NOT NULL, role VARCHAR(10) NOT NULL, last_seen_at TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT NULL, added_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL, company_id UUID NOT NULL, site_id UUID NOT NULL, user_id UUID NOT NULL, PRIMARY KEY (id))');
        $this->addSql('CREATE UNIQUE INDEX UNIQ_4A5427F6BD1646A76ED395 ON site_member (site_id, user_id)');
        $this->addSql('CREATE INDEX IDX_4A5427979B1AD6 ON site_member (company_id)');
        $this->addSql('CREATE INDEX IDX_4A5427F6BD1646 ON site_member (site_id)');
        $this->addSql('CREATE INDEX IDX_4A5427A76ED395 ON site_member (user_id)');
        $this->addSql('CREATE TABLE messenger_messages (id BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL, body TEXT NOT NULL, headers TEXT NOT NULL, queue_name VARCHAR(190) NOT NULL, created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL, available_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL, delivered_at TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT NULL, PRIMARY KEY (id))');
        $this->addSql('CREATE INDEX IDX_75EA56E0FB7336F0E3BD61CE16BA31DBBF396750 ON messenger_messages (queue_name, available_at, delivered_at, id)');
        $this->addSql('ALTER TABLE activity_event ADD CONSTRAINT FK_25AC3C14979B1AD6 FOREIGN KEY (company_id) REFERENCES company (id) ON DELETE CASCADE NOT DEFERRABLE');
        $this->addSql('ALTER TABLE activity_event ADD CONSTRAINT FK_25AC3C14F6BD1646 FOREIGN KEY (site_id) REFERENCES site (id) ON DELETE CASCADE NOT DEFERRABLE');
        $this->addSql('ALTER TABLE activity_event ADD CONSTRAINT FK_25AC3C1410DAF24A FOREIGN KEY (actor_id) REFERENCES app_user (id) ON DELETE SET NULL NOT DEFERRABLE');
        $this->addSql('ALTER TABLE api_token ADD CONSTRAINT FK_7BA2F5EBA76ED395 FOREIGN KEY (user_id) REFERENCES app_user (id) ON DELETE CASCADE NOT DEFERRABLE');
        $this->addSql('ALTER TABLE app_user ADD CONSTRAINT FK_88BDF3E9979B1AD6 FOREIGN KEY (company_id) REFERENCES company (id) ON DELETE CASCADE NOT DEFERRABLE');
        $this->addSql('ALTER TABLE channel ADD CONSTRAINT FK_A2F98E47979B1AD6 FOREIGN KEY (company_id) REFERENCES company (id) ON DELETE CASCADE NOT DEFERRABLE');
        $this->addSql('ALTER TABLE channel ADD CONSTRAINT FK_A2F98E47F6BD1646 FOREIGN KEY (site_id) REFERENCES site (id) ON DELETE CASCADE NOT DEFERRABLE');
        $this->addSql('ALTER TABLE classification_rule ADD CONSTRAINT FK_C26DA372979B1AD6 FOREIGN KEY (company_id) REFERENCES company (id) ON DELETE CASCADE NOT DEFERRABLE');
        $this->addSql('ALTER TABLE device_token ADD CONSTRAINT FK_99B2415C979B1AD6 FOREIGN KEY (company_id) REFERENCES company (id) ON DELETE CASCADE NOT DEFERRABLE');
        $this->addSql('ALTER TABLE device_token ADD CONSTRAINT FK_99B2415CA76ED395 FOREIGN KEY (user_id) REFERENCES app_user (id) ON DELETE CASCADE NOT DEFERRABLE');
        $this->addSql('ALTER TABLE document ADD CONSTRAINT FK_D8698A76979B1AD6 FOREIGN KEY (company_id) REFERENCES company (id) ON DELETE CASCADE NOT DEFERRABLE');
        $this->addSql('ALTER TABLE document ADD CONSTRAINT FK_D8698A76F6BD1646 FOREIGN KEY (site_id) REFERENCES site (id) ON DELETE CASCADE NOT DEFERRABLE');
        $this->addSql('ALTER TABLE document ADD CONSTRAINT FK_D8698A76162CB942 FOREIGN KEY (folder_id) REFERENCES folder (id) ON DELETE RESTRICT NOT DEFERRABLE');
        $this->addSql('ALTER TABLE document ADD CONSTRAINT FK_D8698A769407EE77 FOREIGN KEY (current_version_id) REFERENCES document_version (id) ON DELETE SET NULL NOT DEFERRABLE');
        $this->addSql('ALTER TABLE document ADD CONSTRAINT FK_D8698A76B03A8386 FOREIGN KEY (created_by_id) REFERENCES app_user (id) ON DELETE SET NULL NOT DEFERRABLE');
        $this->addSql('ALTER TABLE document_version ADD CONSTRAINT FK_1B73751F979B1AD6 FOREIGN KEY (company_id) REFERENCES company (id) ON DELETE CASCADE NOT DEFERRABLE');
        $this->addSql('ALTER TABLE document_version ADD CONSTRAINT FK_1B73751FC33F7837 FOREIGN KEY (document_id) REFERENCES document (id) ON DELETE CASCADE NOT DEFERRABLE');
        $this->addSql('ALTER TABLE document_version ADD CONSTRAINT FK_1B73751FA2B28FE8 FOREIGN KEY (uploaded_by_id) REFERENCES app_user (id) ON DELETE SET NULL NOT DEFERRABLE');
        $this->addSql('ALTER TABLE folder ADD CONSTRAINT FK_ECA209CD979B1AD6 FOREIGN KEY (company_id) REFERENCES company (id) ON DELETE CASCADE NOT DEFERRABLE');
        $this->addSql('ALTER TABLE folder ADD CONSTRAINT FK_ECA209CDF6BD1646 FOREIGN KEY (site_id) REFERENCES site (id) ON DELETE CASCADE NOT DEFERRABLE');
        $this->addSql('ALTER TABLE folder ADD CONSTRAINT FK_ECA209CD727ACA70 FOREIGN KEY (parent_id) REFERENCES folder (id) ON DELETE CASCADE NOT DEFERRABLE');
        $this->addSql('ALTER TABLE message ADD CONSTRAINT FK_B6BD307F979B1AD6 FOREIGN KEY (company_id) REFERENCES company (id) ON DELETE CASCADE NOT DEFERRABLE');
        $this->addSql('ALTER TABLE message ADD CONSTRAINT FK_B6BD307F72F5A1AA FOREIGN KEY (channel_id) REFERENCES channel (id) ON DELETE CASCADE NOT DEFERRABLE');
        $this->addSql('ALTER TABLE message ADD CONSTRAINT FK_B6BD307FF675F31B FOREIGN KEY (author_id) REFERENCES app_user (id) ON DELETE SET NULL NOT DEFERRABLE');
        $this->addSql('ALTER TABLE notification ADD CONSTRAINT FK_BF5476CA979B1AD6 FOREIGN KEY (company_id) REFERENCES company (id) ON DELETE CASCADE NOT DEFERRABLE');
        $this->addSql('ALTER TABLE notification ADD CONSTRAINT FK_BF5476CAA76ED395 FOREIGN KEY (user_id) REFERENCES app_user (id) ON DELETE CASCADE NOT DEFERRABLE');
        $this->addSql('ALTER TABLE notification ADD CONSTRAINT FK_BF5476CAF6BD1646 FOREIGN KEY (site_id) REFERENCES site (id) ON DELETE CASCADE NOT DEFERRABLE');
        $this->addSql('ALTER TABLE photo ADD CONSTRAINT FK_14B78418979B1AD6 FOREIGN KEY (company_id) REFERENCES company (id) ON DELETE CASCADE NOT DEFERRABLE');
        $this->addSql('ALTER TABLE photo ADD CONSTRAINT FK_14B78418F6BD1646 FOREIGN KEY (site_id) REFERENCES site (id) ON DELETE CASCADE NOT DEFERRABLE');
        $this->addSql('ALTER TABLE photo ADD CONSTRAINT FK_14B78418A2B28FE8 FOREIGN KEY (uploaded_by_id) REFERENCES app_user (id) ON DELETE SET NULL NOT DEFERRABLE');
        $this->addSql('ALTER TABLE site ADD CONSTRAINT FK_694309E4979B1AD6 FOREIGN KEY (company_id) REFERENCES company (id) ON DELETE CASCADE NOT DEFERRABLE');
        $this->addSql('ALTER TABLE site_member ADD CONSTRAINT FK_4A5427979B1AD6 FOREIGN KEY (company_id) REFERENCES company (id) ON DELETE CASCADE NOT DEFERRABLE');
        $this->addSql('ALTER TABLE site_member ADD CONSTRAINT FK_4A5427F6BD1646 FOREIGN KEY (site_id) REFERENCES site (id) ON DELETE CASCADE NOT DEFERRABLE');
        $this->addSql('ALTER TABLE site_member ADD CONSTRAINT FK_4A5427A76ED395 FOREIGN KEY (user_id) REFERENCES app_user (id) ON DELETE CASCADE NOT DEFERRABLE');
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql('ALTER TABLE activity_event DROP CONSTRAINT FK_25AC3C14979B1AD6');
        $this->addSql('ALTER TABLE activity_event DROP CONSTRAINT FK_25AC3C14F6BD1646');
        $this->addSql('ALTER TABLE activity_event DROP CONSTRAINT FK_25AC3C1410DAF24A');
        $this->addSql('ALTER TABLE api_token DROP CONSTRAINT FK_7BA2F5EBA76ED395');
        $this->addSql('ALTER TABLE app_user DROP CONSTRAINT FK_88BDF3E9979B1AD6');
        $this->addSql('ALTER TABLE channel DROP CONSTRAINT FK_A2F98E47979B1AD6');
        $this->addSql('ALTER TABLE channel DROP CONSTRAINT FK_A2F98E47F6BD1646');
        $this->addSql('ALTER TABLE classification_rule DROP CONSTRAINT FK_C26DA372979B1AD6');
        $this->addSql('ALTER TABLE device_token DROP CONSTRAINT FK_99B2415C979B1AD6');
        $this->addSql('ALTER TABLE device_token DROP CONSTRAINT FK_99B2415CA76ED395');
        $this->addSql('ALTER TABLE document DROP CONSTRAINT FK_D8698A76979B1AD6');
        $this->addSql('ALTER TABLE document DROP CONSTRAINT FK_D8698A76F6BD1646');
        $this->addSql('ALTER TABLE document DROP CONSTRAINT FK_D8698A76162CB942');
        $this->addSql('ALTER TABLE document DROP CONSTRAINT FK_D8698A769407EE77');
        $this->addSql('ALTER TABLE document DROP CONSTRAINT FK_D8698A76B03A8386');
        $this->addSql('ALTER TABLE document_version DROP CONSTRAINT FK_1B73751F979B1AD6');
        $this->addSql('ALTER TABLE document_version DROP CONSTRAINT FK_1B73751FC33F7837');
        $this->addSql('ALTER TABLE document_version DROP CONSTRAINT FK_1B73751FA2B28FE8');
        $this->addSql('ALTER TABLE folder DROP CONSTRAINT FK_ECA209CD979B1AD6');
        $this->addSql('ALTER TABLE folder DROP CONSTRAINT FK_ECA209CDF6BD1646');
        $this->addSql('ALTER TABLE folder DROP CONSTRAINT FK_ECA209CD727ACA70');
        $this->addSql('ALTER TABLE message DROP CONSTRAINT FK_B6BD307F979B1AD6');
        $this->addSql('ALTER TABLE message DROP CONSTRAINT FK_B6BD307F72F5A1AA');
        $this->addSql('ALTER TABLE message DROP CONSTRAINT FK_B6BD307FF675F31B');
        $this->addSql('ALTER TABLE notification DROP CONSTRAINT FK_BF5476CA979B1AD6');
        $this->addSql('ALTER TABLE notification DROP CONSTRAINT FK_BF5476CAA76ED395');
        $this->addSql('ALTER TABLE notification DROP CONSTRAINT FK_BF5476CAF6BD1646');
        $this->addSql('ALTER TABLE photo DROP CONSTRAINT FK_14B78418979B1AD6');
        $this->addSql('ALTER TABLE photo DROP CONSTRAINT FK_14B78418F6BD1646');
        $this->addSql('ALTER TABLE photo DROP CONSTRAINT FK_14B78418A2B28FE8');
        $this->addSql('ALTER TABLE site DROP CONSTRAINT FK_694309E4979B1AD6');
        $this->addSql('ALTER TABLE site_member DROP CONSTRAINT FK_4A5427979B1AD6');
        $this->addSql('ALTER TABLE site_member DROP CONSTRAINT FK_4A5427F6BD1646');
        $this->addSql('ALTER TABLE site_member DROP CONSTRAINT FK_4A5427A76ED395');
        $this->addSql('DROP TABLE activity_event');
        $this->addSql('DROP TABLE api_token');
        $this->addSql('DROP TABLE app_user');
        $this->addSql('DROP TABLE channel');
        $this->addSql('DROP TABLE classification_rule');
        $this->addSql('DROP TABLE company');
        $this->addSql('DROP TABLE device_token');
        $this->addSql('DROP TABLE document');
        $this->addSql('DROP TABLE document_version');
        $this->addSql('DROP TABLE folder');
        $this->addSql('DROP TABLE login_code');
        $this->addSql('DROP TABLE message');
        $this->addSql('DROP TABLE notification');
        $this->addSql('DROP TABLE photo');
        $this->addSql('DROP TABLE site');
        $this->addSql('DROP TABLE site_member');
        $this->addSql('DROP TABLE messenger_messages');
    }
}
