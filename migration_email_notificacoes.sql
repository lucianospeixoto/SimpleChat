-- Execute uma vez no banco simple_chat para adicionar e-mails e contadores de não lidas.
USE simple_chat;

ALTER TABLE usuarios
    ADD COLUMN email VARCHAR(254) NULL AFTER username,
    ADD UNIQUE KEY uq_usuarios_email (email);

ALTER TABLE mensagens
    ADD COLUMN lida TINYINT(1) NOT NULL DEFAULT 0 AFTER enviado_em;
