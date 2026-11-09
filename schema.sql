-- Schema final do simple_chat (versão consolidada, igual ao que você montou)
CREATE DATABASE IF NOT EXISTS simple_chat CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE simple_chat;

CREATE TABLE usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome_completo VARCHAR(120) NOT NULL,
    data_nascimento DATE NOT NULL,
    sexo ENUM('FEMININO', 'MASCULINO', 'OUTRO', 'PREFIRO_NAO_INFORMAR') NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    senha VARCHAR(255) NOT NULL,            -- guarda o HASH da senha (nunca texto puro)
    foto_perfil VARCHAR(255) DEFAULT 'default.png',
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE amizades (
    id INT AUTO_INCREMENT PRIMARY KEY,
    de_usuario_id INT NOT NULL,
    para_usuario_id INT NOT NULL,
    status ENUM('PENDENTE', 'ACEITO') DEFAULT 'PENDENTE',
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_par (de_usuario_id, para_usuario_id),
    FOREIGN KEY (de_usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (para_usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE mensagens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    remetente_id INT NOT NULL,
    destinatario_id INT NOT NULL,
    tipo ENUM('TEXTO', 'IMAGEM', 'VIDEO') DEFAULT 'TEXTO',
    conteudo TEXT NULL,
    enviado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_conversa (remetente_id, destinatario_id, id),
    FOREIGN KEY (remetente_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (destinatario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE chat_grupos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(80) NOT NULL,
    criador_id INT NOT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (criador_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE grupo_membros (
    grupo_id INT NOT NULL,
    usuario_id INT NOT NULL,
    entrou_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (grupo_id, usuario_id),
    FOREIGN KEY (grupo_id) REFERENCES chat_grupos(id) ON DELETE CASCADE,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE grupo_convites (
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

CREATE TABLE mensagens_grupo (
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
