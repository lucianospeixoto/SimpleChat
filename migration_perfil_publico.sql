-- Execute uma vez para adicionar a biografia editavel ao perfil.
USE simple_chat;

ALTER TABLE usuarios
    ADD COLUMN bio VARCHAR(280) NOT NULL DEFAULT '' AFTER foto_perfil;
