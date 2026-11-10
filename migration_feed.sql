-- Execute uma vez em uma instalacao existente.
USE simple_chat;

CREATE TABLE publicacoes (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    texto TEXT NOT NULL,
    tipo ENUM('TEXTO', 'IMAGEM', 'VIDEO') NOT NULL DEFAULT 'TEXTO',
    midia_url VARCHAR(255) NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_publicacoes_usuario (usuario_id, id),
    CONSTRAINT fk_publicacoes_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE publicacao_curtidas (
    publicacao_id BIGINT NOT NULL,
    usuario_id INT NOT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (publicacao_id, usuario_id),
    CONSTRAINT fk_publicacao_curtidas_publicacao FOREIGN KEY (publicacao_id) REFERENCES publicacoes(id) ON DELETE CASCADE,
    CONSTRAINT fk_publicacao_curtidas_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE publicacao_comentarios (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    publicacao_id BIGINT NOT NULL,
    usuario_id INT NOT NULL,
    texto VARCHAR(1500) NOT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_comentarios_publicacao (publicacao_id, id),
    CONSTRAINT fk_publicacao_comentarios_publicacao FOREIGN KEY (publicacao_id) REFERENCES publicacoes(id) ON DELETE CASCADE,
    CONSTRAINT fk_publicacao_comentarios_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
