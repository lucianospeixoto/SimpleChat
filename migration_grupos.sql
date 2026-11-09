-- Execute uma vez no banco simple_chat para habilitar conversas em grupo.
USE simple_chat;

CREATE TABLE IF NOT EXISTS chat_grupos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(80) NOT NULL,
    criador_id INT NOT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (criador_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS grupo_membros (
    grupo_id INT NOT NULL,
    usuario_id INT NOT NULL,
    entrou_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (grupo_id, usuario_id),
    FOREIGN KEY (grupo_id) REFERENCES chat_grupos(id) ON DELETE CASCADE,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS grupo_convites (
    id INT AUTO_INCREMENT PRIMARY KEY,
    grupo_id INT NOT NULL,
    convidante_id INT NOT NULL,
    convidado_id INT NOT NULL,
    status ENUM('PENDENTE', 'ACEITO', 'RECUSADO') DEFAULT 'PENDENTE',
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_convite_grupo_usuario (grupo_id, convidado_id),
    FOREIGN KEY (grupo_id) REFERENCES chat_grupos(id) ON DELETE CASCADE,
    FOREIGN KEY (convidante_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (convidado_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mensagens_grupo (
    id INT AUTO_INCREMENT PRIMARY KEY,
    grupo_id INT NOT NULL,
    remetente_id INT NOT NULL,
    tipo ENUM('TEXTO', 'IMAGEM', 'VIDEO') DEFAULT 'TEXTO',
    conteudo TEXT NULL,
    enviado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_grupo_mensagem (grupo_id, id),
    FOREIGN KEY (grupo_id) REFERENCES chat_grupos(id) ON DELETE CASCADE,
    FOREIGN KEY (remetente_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
