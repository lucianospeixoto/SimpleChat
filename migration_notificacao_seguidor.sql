-- Execute uma vez depois da migration_rede_social.sql.
USE simple_chat;

ALTER TABLE notificacoes_social
    MODIFY tipo ENUM('CURTIDA', 'COMENTARIO', 'PUBLICACAO', 'SEGUIDOR') NOT NULL,
    MODIFY publicacao_id BIGINT NULL;
