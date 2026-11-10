-- Execute uma vez depois de migration_grupos.sql e migration_email_notificacoes.sql.
USE simple_chat;

ALTER TABLE mensagens
    ADD COLUMN resposta_id INT NULL AFTER lida,
    ADD INDEX idx_mensagem_resposta (resposta_id),
    ADD CONSTRAINT fk_mensagens_resposta
        FOREIGN KEY (resposta_id) REFERENCES mensagens(id) ON DELETE SET NULL;

ALTER TABLE mensagens_grupo
    ADD COLUMN resposta_id INT NULL AFTER enviado_em,
    ADD INDEX idx_mensagem_grupo_resposta (resposta_id),
    ADD CONSTRAINT fk_mensagens_grupo_resposta
        FOREIGN KEY (resposta_id) REFERENCES mensagens_grupo(id) ON DELETE SET NULL;

CREATE TABLE mencoes_grupo (
    mensagem_id INT NOT NULL,
    usuario_id INT NOT NULL,
    lida TINYINT(1) NOT NULL DEFAULT 0,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (mensagem_id, usuario_id),
    INDEX idx_mencoes_nao_lidas (usuario_id, lida, mensagem_id),
    CONSTRAINT fk_mencoes_mensagem
        FOREIGN KEY (mensagem_id) REFERENCES mensagens_grupo(id) ON DELETE CASCADE,
    CONSTRAINT fk_mencoes_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
