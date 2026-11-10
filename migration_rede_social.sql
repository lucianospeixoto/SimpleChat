-- Execute uma vez depois da migration_feed.sql e migration_perfil_publico.sql.
USE simple_chat;

CREATE TABLE seguidores (
    seguidor_id INT NOT NULL,
    seguido_id INT NOT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (seguidor_id, seguido_id),
    INDEX idx_seguidores_seguido (seguido_id, seguidor_id),
    CONSTRAINT fk_seguidores_seguidor FOREIGN KEY (seguidor_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    CONSTRAINT fk_seguidores_seguido FOREIGN KEY (seguido_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE publicacao_comentarios
    ADD COLUMN resposta_id BIGINT NULL AFTER texto,
    ADD INDEX idx_comentarios_resposta (resposta_id),
    ADD CONSTRAINT fk_comentarios_resposta FOREIGN KEY (resposta_id)
        REFERENCES publicacao_comentarios(id) ON DELETE SET NULL;

CREATE TABLE notificacoes_social (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    ator_id INT NOT NULL,
    tipo ENUM('CURTIDA', 'COMENTARIO', 'PUBLICACAO', 'SEGUIDOR') NOT NULL,
    publicacao_id BIGINT NULL,
    comentario_id BIGINT NULL,
    lida TINYINT(1) NOT NULL DEFAULT 0,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_notificacoes_usuario (usuario_id, lida, id),
    CONSTRAINT fk_notificacoes_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    CONSTRAINT fk_notificacoes_ator FOREIGN KEY (ator_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    CONSTRAINT fk_notificacoes_publicacao FOREIGN KEY (publicacao_id) REFERENCES publicacoes(id) ON DELETE CASCADE,
    CONSTRAINT fk_notificacoes_comentario FOREIGN KEY (comentario_id) REFERENCES publicacao_comentarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Para bancos que jÃ¡ aplicaram esta migraÃ§Ã£o, use migration_notificacao_seguidor.sql.
