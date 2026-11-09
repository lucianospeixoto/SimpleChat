# Deploy do simple_chat em Ubuntu (Oracle Cloud)

1. Na OCI, libere TCP 80 na Security List ou NSG associado à instância. Na VM, libere a porta e persista a regra:

   ```bash
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
   sudo netfilter-persistent save
   ```

2. Instale os pacotes e o MySQL:

   ```bash
   sudo apt update
   sudo apt install -y python3 python3-venv python3-pip mysql-server nginx iptables-persistent
   sudo mysql < /caminho/para/simple_chat/schema.sql
   ```

3. Crie um usuário exclusivo para o aplicativo (substitua a senha):

   ```bash
   sudo mysql <<'SQL'
   CREATE USER 'simple_chat'@'localhost' IDENTIFIED BY 'senha-forte-aqui';
   GRANT SELECT, INSERT, UPDATE, DELETE ON simple_chat.* TO 'simple_chat'@'localhost';
   FLUSH PRIVILEGES;
   SQL
   ```

4. Copie o projeto para `/opt/simple_chat`, crie o ambiente e configure as credenciais:

   ```bash
   cd /opt/simple_chat
   python3 -m venv .venv
   . .venv/bin/activate
   pip install -r requirements.txt
   cp .env.example .env
   nano .env
   ```

   Defina `DB_USER`, `DB_PASSWORD` e `DB_NAME`; gere um `SECRET_KEY` aleatório longo, por exemplo com `python3 -c 'import secrets; print(secrets.token_hex(32))'`. Restrinja o acesso ao arquivo: `chmod 600 .env`.

5. Crie `/etc/systemd/system/simple_chat.service` (ajuste `User` para a conta que possui os arquivos):

   ```ini
   [Unit]
   Description=simple_chat Flask application
   After=network.target mysql.service

   [Service]
   User=www-data
   Group=www-data
   WorkingDirectory=/opt/simple_chat
   EnvironmentFile=/opt/simple_chat/.env
   ExecStart=/opt/simple_chat/.venv/bin/gunicorn --workers 3 --bind 127.0.0.1:5000 server:app
   Restart=always

   [Install]
   WantedBy=multi-user.target
   ```

   Dê à conta do serviço permissão de escrita em `/opt/simple_chat/uploads` e inicie:

   ```bash
   sudo chown -R www-data:www-data /opt/simple_chat/uploads
   sudo systemctl daemon-reload
   sudo systemctl enable --now simple_chat
   sudo systemctl status simple_chat
   ```

6. Crie `/etc/nginx/sites-available/simple_chat`:

   ```nginx
   server {
       listen 80;
       server_name _;
       client_max_body_size 50M;
       location / {
           proxy_pass http://127.0.0.1:5000;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

   Ative e valide a configuração:

   ```bash
   sudo ln -s /etc/nginx/sites-available/simple_chat /etc/nginx/sites-enabled/simple_chat
   sudo nginx -t
   sudo systemctl reload nginx
   ```

7. Abra `http://IP_PUBLICO` em um celular conectado a outra rede e teste cadastro, conversa e envio de mídia. Se houver domínio apontado para a VPS, HTTPS pode ser configurado com Certbot (`sudo apt install certbot python3-certbot-nginx` e `sudo certbot --nginx`).
