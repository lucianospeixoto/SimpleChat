-- Execute uma única vez no banco simple_chat.
-- DELETE dispara ON DELETE CASCADE e também apaga amizades e mensagens.
USE simple_chat;

DELETE FROM usuarios;

ALTER TABLE usuarios
    ADD COLUMN nome_completo VARCHAR(120) NOT NULL AFTER id,
    ADD COLUMN data_nascimento DATE NOT NULL AFTER nome_completo,
    ADD COLUMN sexo ENUM('FEMININO', 'MASCULINO', 'OUTRO', 'PREFIRO_NAO_INFORMAR') NOT NULL AFTER data_nascimento;
