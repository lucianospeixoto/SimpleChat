# Simple Chat

Aplicação de mensagens privadas e conversas em grupo. O projeto usa Flask e MySQL no servidor e HTML, CSS e JavaScript puros no navegador. As mensagens são atualizadas por polling HTTP.

## Funcionalidades

- Cadastro e login por nome de usuário e senha.
- Perfil com nome completo, data de nascimento, sexo e foto.
- E-mail obrigatório no cadastro, com aviso para contas antigas que ainda não o informaram.
- Edição do perfil com confirmação da senha atual; permite trocar o nome de usuário e, opcionalmente, a senha.
- Nome de usuário único, com 3 a 30 caracteres, em minúsculas, sem espaços ou acentos. Caracteres especiais ASCII são aceitos.
- Senha de cadastro com no mínimo 10 caracteres, incluindo letra maiúscula, minúscula, número e símbolo. O cadastro mostra um medidor e permite exibir a senha.
- Solicitações de amizade e mensagens privadas.
- Contador de mensagens privadas não lidas por contato; o nome completo aparece acima do nome de usuário.
- Contas sem e-mail ficam bloqueadas na tela e na API até informarem um e-mail ou saírem da conta.
- Menções de membros em grupos com `@nomeusuario`, indicação de menções não lidas e respostas vinculadas a mensagens específicas.
- Grupos privados: o criador convida amigos, e cada convidado precisa aceitar para entrar. O convite também pode ser recusado.
- Mensagens de texto, imagens e vídeos em conversas privadas e em grupos.
- Polling de mensagens a cada 2 segundos e atualização das listas a cada 10 segundos.
- Horários armazenados em UTC e exibidos no fuso `America/Sao_Paulo`.

## Estrutura

```text
simple_chat/
├── server.py
├── schema.sql
├── migration_grupos.sql
├── migration_email_notificacoes.sql
├── migration_mencoes_respostas.sql
├── migration_reset_usuarios.sql
├── requirements.txt
├── .env.example
├── .gitignore
├── DEPLOY.md
├── README.md
├── static/
│   ├── index.html
│   ├── style.css
│   └── app.js
└── uploads/                 # Criada automaticamente; ignorada pelo Git
    ├── perfil/
    └── midia/
```

## Requisitos

- Python 3.10 ou superior.
- MySQL 8 ou compatível, com suporte a `utf8mb4`.
- Para produção: Ubuntu, Gunicorn e Nginx.

## Rodar localmente no Windows

Abra o PowerShell na pasta do projeto.

### 1. Preparar o banco

No MySQL, importe o schema completo em um banco novo:

```powershell
mysql -u root -p -h 127.0.0.1 < .\schema.sql
```

Crie um usuário exclusivo para o app. No prompt do MySQL, use uma senha própria:

```sql
CREATE USER 'simple_chat'@'localhost' IDENTIFIED BY 'SENHA_FORTE_AQUI';
GRANT SELECT, INSERT, UPDATE, DELETE ON simple_chat.* TO 'simple_chat'@'localhost';
FLUSH PRIVILEGES;
```

Não use o usuário `root` nas configurações do aplicativo.

### 2. Instalar as dependências

```powershell
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Se o PowerShell bloquear a ativação do ambiente virtual, você pode chamar os executáveis diretamente:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

### 3. Configurar variáveis

```powershell
Copy-Item .env.example .env
notepad .env
```

Preencha `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` e `SECRET_KEY`. Gere uma chave de sessão aleatória:

```powershell
python -c "import secrets; print(secrets.token_hex(32))"
```

Copie o resultado para `SECRET_KEY` no `.env`. Não publique nem compartilhe esse arquivo.

### 4. Iniciar

```powershell
python server.py
```

Abra `http://127.0.0.1:5000`. O comando usa o servidor de desenvolvimento do Flask; em produção, use Gunicorn atrás do Nginx.

## Usar o aplicativo

1. Escolha **Criar conta** e preencha os campos de perfil.
2. Digite um nome de usuário válido. O campo converte letras para minúsculas; espaços e acentos não são aceitos.
3. Crie uma senha que atenda aos critérios mostrados pelo medidor.
4. Para conversar em privado, encontre outro usuário, envie uma solicitação de amizade e aguarde a aceitação.
5. Para criar um grupo, selecione **Criar** na seção **Grupos**. O criador pode convidar amigos.
6. Um convite de grupo não adiciona ninguém automaticamente. O convidado precisa aceitar; também pode recusar.
7. Para editar seus dados, use **Editar dados** no painel. A senha atual é exigida para salvar. A nova senha é opcional.

## Publicar na Oracle Cloud

O guia de instalação do Ubuntu, MySQL, systemd, Gunicorn e Nginx está em [DEPLOY.md](DEPLOY.md). Ele explica a liberação da porta 80 na rede da OCI, a configuração do serviço e o proxy reverso.

Na OCI, mantenha abertas apenas as portas necessárias. O Nginx atende publicamente na porta 80 (e 443 quando HTTPS estiver configurado); Gunicorn deve ficar em `127.0.0.1:5000`. O MySQL não deve aceitar conexões públicas na porta 3306. Restrinja também o SSH à sua rede quando possível.

Para contas reais, configure HTTPS com um domínio e Certbot. HTTP não criptografa as senhas nem os cookies de sessão durante o trânsito.

## Atualizar uma instalação na VPS

### Usando Git

Depois de clonar o repositório na VPS e configurar a origem do Git, atualize os arquivos com:

```bash
cd /home/ubuntu/simple_chat
git pull
```

Se `requirements.txt` mudou:

```bash
.venv/bin/pip install -r requirements.txt
```

Depois de alterar `server.py`, reinicie o serviço:

```bash
sudo systemctl restart simple_chat
sudo systemctl status simple_chat --no-pager
```

Alterações somente em `static/` normalmente não precisam de reinício. Recarregue o navegador com `Ctrl+F5` para atualizar os arquivos estáticos.

### Usando SCP no Windows

No PowerShell local, a partir da pasta do projeto, copie somente os arquivos alterados. Exemplo para o frontend:

```powershell
$Key = "C:\CAMINHO\DA\CHAVE\ssh-key-2026-05-18.key"
scp -i $Key -r .\static ubuntu@IP_PUBLICO:/home/ubuntu/simple_chat/
```

Para atualizar o backend:

```powershell
scp -i $Key .\server.py ubuntu@IP_PUBLICO:/home/ubuntu/simple_chat/server.py
ssh -i $Key ubuntu@IP_PUBLICO "sudo systemctl restart simple_chat"
```

Não copie `.env`, `.venv`, `uploads/` nem a chave privada para o GitHub ou para outro destino público.

## Banco de dados e migrações

- **Instalação nova:** importe `schema.sql` uma vez para criar todas as tabelas.
- **Adicionar os grupos a uma instalação existente:** copie `migration_grupos.sql` para a VPS e execute uma vez:

  ```bash
  mysql -u root -p -h 127.0.0.1 < /home/ubuntu/simple_chat/migration_grupos.sql
  ```

  Essa migração cria as tabelas de grupos e não apaga usuários ou mensagens privadas.

- **Adicionar e-mail e contador de mensagens não lidas a uma instalação existente:** faça backup do banco, copie `migration_email_notificacoes.sql` para a VPS e execute uma vez:

  ```bash
  mysql -u root -p -h 127.0.0.1 < /home/ubuntu/simple_chat/migration_email_notificacoes.sql
  ```

  A migração mantém usuários e mensagens. Contas existentes ficam com e-mail vazio e verão o aviso para adicioná-lo; as mensagens antigas começam como lidas.

- **Adicionar menções e respostas a uma instalação existente:** depois das migrações de grupos e de e-mail, faça backup e execute uma vez:

  ```bash
  mysql -u root -p -h 127.0.0.1 < /home/ubuntu/simple_chat/migration_mencoes_respostas.sql
  ```

  Ela adiciona as referências das respostas e a tabela que controla as menções pendentes. Não apaga conversas existentes.

- **`migration_reset_usuarios.sql` é destrutiva.** Ela apaga todos os usuários; as chaves estrangeiras também apagam amizades e mensagens relacionadas. Não a execute para uma atualização normal. Ela foi criada para a migração inicial dos campos de perfil.
- Não reimporte o `schema.sql` completo sobre um banco em uso. Para mudanças futuras, crie uma migração específica e faça backup antes de aplicá-la.
- Os arquivos de fotos e vídeos em `uploads/` ficam no disco da VPS e não são removidos automaticamente quando registros do banco são apagados.

## Rotas principais da API

As rotas autenticadas usam a sessão do Flask, enviada pelo cookie do navegador.

| Método | Rota | Uso |
|---|---|---|
| `POST` | `/api/cadastro` | Criar conta (`multipart/form-data`) |
| `POST` | `/api/login` | Entrar (`JSON`) |
| `POST` | `/api/logout` | Sair |
| `GET` | `/api/eu` | Consultar sessão atual |
| `GET` | `/api/perfil/dados` | Ler os próprios dados de perfil |
| `POST` | `/api/perfil/atualizar` | Atualizar perfil com senha atual (`JSON`) |
| `POST` | `/api/perfil/email` | Adicionar e-mail a uma conta existente (`JSON`) |
| `GET` | `/api/amigos` | Listar amigos |
| `POST` | `/api/amizades/solicitar` | Solicitar amizade (`JSON`) |
| `GET` | `/api/grupos` | Listar grupos dos quais participa |
| `POST` | `/api/grupos` | Criar grupo (`JSON`) |
| `POST` | `/api/grupos/<id>/convites` | Convidar um amigo (`JSON`) |
| `GET` | `/api/grupos/convites` | Listar convites recebidos |
| `POST` | `/api/grupos/convites/<id>/aceitar` | Aceitar convite |
| `POST` | `/api/grupos/convites/<id>/recusar` | Recusar convite |
| `GET` | `/api/grupos/<id>/mensagens` | Buscar mensagens do grupo |
| `POST` | `/api/grupos/<id>/mensagens` | Enviar texto ou mídia ao grupo |
| `POST` | `/api/mensagens` | Enviar mensagem privada |
| `GET` | `/api/mensagens/<amigo_id>` | Buscar mensagens privadas |

Mensagens aceitam texto ou arquivos de imagem (`png`, `jpg`, `jpeg`, `gif`, `webp`) e vídeo (`mp4`, `webm`, `mov`). O limite configurado é 50 MB por requisição; Nginx e Flask precisam permitir esse tamanho.

Em conversas de grupo, digite `@` no campo de mensagem para escolher uma pessoa e enviar uma menção. O grupo mostra a quantidade de menções pendentes para cada participante. Use **Responder** em uma mensagem para vincular a próxima mensagem a ela; isso funciona em conversas privadas e em grupo.

## Diagnóstico

Estado do serviço:

```bash
sudo systemctl status simple_chat --no-pager
```

Log recente do aplicativo:

```bash
sudo journalctl -u simple_chat -n 80 --no-pager -l
```

Validar e recarregar Nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Não compartilhe a saída de `.env`, senhas, chaves SSH privadas nem `SECRET_KEY` ao pedir ajuda.
