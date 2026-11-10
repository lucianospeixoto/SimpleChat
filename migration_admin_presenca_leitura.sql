-- Execute uma vez no banco em uso. Promove a conta @luciano como primeiro administrador.
USE simple_chat;

ALTER TABLE usuarios
    ADD COLUMN is_admin TINYINT(1) NOT NULL DEFAULT 0,
    ADD COLUMN verificado TINYINT(1) NOT NULL DEFAULT 0,
    ADD COLUMN ultimo_ativo TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE usuarios SET ultimo_ativo=UTC_TIMESTAMP() - INTERVAL 1 DAY;

CREATE TABLE mensagens_grupo_leituras (
    mensagem_id INT NOT NULL,
    usuario_id INT NOT NULL,
    lida_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (mensagem_id, usuario_id),
    INDEX idx_leituras_grupo_usuario (usuario_id, mensagem_id),
    CONSTRAINT fk_leitura_grupo_mensagem FOREIGN KEY (mensagem_id) REFERENCES mensagens_grupo(id) ON DELETE CASCADE,
    CONSTRAINT fk_leitura_grupo_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

UPDATE usuarios SET is_admin=1 WHERE username='luciano';
