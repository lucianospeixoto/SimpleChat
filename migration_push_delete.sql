-- Execute uma vez depois das migrações de grupos, e-mail, menções e respostas.
USE simple_chat;

ALTER TABLE mensagens ADD COLUMN apagada TINYINT(1) NOT NULL DEFAULT 0 AFTER resposta_id;
ALTER TABLE mensagens_grupo ADD COLUMN apagada TINYINT(1) NOT NULL DEFAULT 0 AFTER resposta_id;

CREATE TABLE mensagens_ocultas (
    mensagem_id INT NOT NULL,
    usuario_id INT NOT NULL,
    PRIMARY KEY (mensagem_id, usuario_id),
    CONSTRAINT fk_mensagens_ocultas_mensagem
        FOREIGN KEY (mensagem_id) REFERENCES mensagens(id) ON DELETE CASCADE,
    CONSTRAINT fk_mensagens_ocultas_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE mensagens_grupo_ocultas (
    mensagem_id INT NOT NULL,
    usuario_id INT NOT NULL,
    PRIMARY KEY (mensagem_id, usuario_id),
    CONSTRAINT fk_mensagens_grupo_ocultas_mensagem
        FOREIGN KEY (mensagem_id) REFERENCES mensagens_grupo(id) ON DELETE CASCADE,
    CONSTRAINT fk_mensagens_grupo_ocultas_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE push_subscriptions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    endpoint TEXT NOT NULL,
    endpoint_hash CHAR(64) NOT NULL UNIQUE,
    p256dh VARCHAR(255) NOT NULL,
    auth VARCHAR(255) NOT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_push_usuario (usuario_id),
    CONSTRAINT fk_push_subscriptions_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
