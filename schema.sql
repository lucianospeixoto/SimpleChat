-- Schema final do simple_chat (versão consolidada, igual ao que você montou)
CREATE DATABASE IF NOT EXISTS simple_chat CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE simple_chat;

CREATE TABLE usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome_completo VARCHAR(120) NOT NULL,
    data_nascimento DATE NOT NULL,
    sexo ENUM('FEMININO', 'MASCULINO', 'OUTRO', 'PREFIRO_NAO_INFORMAR') NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(254) UNIQUE NULL,
    senha VARCHAR(255) NOT NULL,            -- guarda o HASH da senha (nunca texto puro)
    foto_perfil VARCHAR(255) DEFAULT 'default.png',
    bio VARCHAR(280) NOT NULL DEFAULT '',
    is_admin TINYINT(1) NOT NULL DEFAULT 0,
    verificado TINYINT(1) NOT NULL DEFAULT 0,
    ultimo_ativo TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
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

CREATE TABLE seguidores (
    seguidor_id INT NOT NULL,
    seguido_id INT NOT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (seguidor_id, seguido_id),
    INDEX idx_seguidores_seguido (seguido_id, seguidor_id),
    FOREIGN KEY (seguidor_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (seguido_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE mensagens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    remetente_id INT NOT NULL,
    destinatario_id INT NOT NULL,
    tipo ENUM('TEXTO', 'IMAGEM', 'VIDEO') DEFAULT 'TEXTO',
    conteudo TEXT NULL,
    enviado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    lida TINYINT(1) NOT NULL DEFAULT 0,
    resposta_id INT NULL,
    apagada TINYINT(1) NOT NULL DEFAULT 0,
    INDEX idx_conversa (remetente_id, destinatario_id, id),
    INDEX idx_mensagem_resposta (resposta_id),
    FOREIGN KEY (remetente_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (destinatario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (resposta_id) REFERENCES mensagens(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE mensagens_ocultas (
    mensagem_id INT NOT NULL,
    usuario_id INT NOT NULL,
    PRIMARY KEY (mensagem_id, usuario_id),
    FOREIGN KEY (mensagem_id) REFERENCES mensagens(id) ON DELETE CASCADE,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
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
    resposta_id INT NULL,
    apagada TINYINT(1) NOT NULL DEFAULT 0,
    INDEX idx_grupo_mensagem (grupo_id, id),
    INDEX idx_mensagem_grupo_resposta (resposta_id),
    FOREIGN KEY (grupo_id) REFERENCES chat_grupos(id) ON DELETE CASCADE,
    FOREIGN KEY (remetente_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (resposta_id) REFERENCES mensagens_grupo(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE mensagens_grupo_ocultas (
    mensagem_id INT NOT NULL,
    usuario_id INT NOT NULL,
    PRIMARY KEY (mensagem_id, usuario_id),
    FOREIGN KEY (mensagem_id) REFERENCES mensagens_grupo(id) ON DELETE CASCADE,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE mensagens_grupo_leituras (
    mensagem_id INT NOT NULL,
    usuario_id INT NOT NULL,
    lida_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (mensagem_id, usuario_id),
    INDEX idx_leituras_grupo_usuario (usuario_id, mensagem_id),
    FOREIGN KEY (mensagem_id) REFERENCES mensagens_grupo(id) ON DELETE CASCADE,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE mencoes_grupo (
    mensagem_id INT NOT NULL,
    usuario_id INT NOT NULL,
    lida TINYINT(1) NOT NULL DEFAULT 0,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (mensagem_id, usuario_id),
    INDEX idx_mencoes_nao_lidas (usuario_id, lida, mensagem_id),
    FOREIGN KEY (mensagem_id) REFERENCES mensagens_grupo(id) ON DELETE CASCADE,
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
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE publicacoes (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    texto TEXT NOT NULL,
    tipo ENUM('TEXTO', 'IMAGEM', 'VIDEO') NOT NULL DEFAULT 'TEXTO',
    midia_url VARCHAR(255) NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_publicacoes_usuario (usuario_id, id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE publicacao_curtidas (
    publicacao_id BIGINT NOT NULL,
    usuario_id INT NOT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (publicacao_id, usuario_id),
    FOREIGN KEY (publicacao_id) REFERENCES publicacoes(id) ON DELETE CASCADE,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE publicacao_comentarios (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    publicacao_id BIGINT NOT NULL,
    usuario_id INT NOT NULL,
    texto VARCHAR(1500) NOT NULL,
    resposta_id BIGINT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_comentarios_publicacao (publicacao_id, id),
    INDEX idx_comentarios_resposta (resposta_id),
    FOREIGN KEY (publicacao_id) REFERENCES publicacoes(id) ON DELETE CASCADE,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (resposta_id) REFERENCES publicacao_comentarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (ator_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (publicacao_id) REFERENCES publicacoes(id) ON DELETE CASCADE,
    FOREIGN KEY (comentario_id) REFERENCES publicacao_comentarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
