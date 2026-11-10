"""API Flask do simple_chat."""
import os
import re
import uuid
import hashlib
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone
from functools import wraps
from urllib.parse import urlsplit

import pymysql
from pywebpush import WebPushException, webpush
from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory, session
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

load_dotenv()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
PASTA_PERFIL = os.path.join(UPLOAD_DIR, "perfil")
PASTA_MIDIA = os.path.join(UPLOAD_DIR, "midia")
for pasta in (PASTA_PERFIL, PASTA_MIDIA):
    os.makedirs(pasta, exist_ok=True)

EXT_IMAGEM = {"png", "jpg", "jpeg", "gif", "webp"}
EXT_VIDEO = {"mp4", "webm", "mov"}
SEXO_VALIDOS = {"FEMININO", "MASCULINO", "OUTRO", "PREFIRO_NAO_INFORMAR"}
app = Flask(__name__, static_folder="static", static_url_path="")
app.config.update(
    SECRET_KEY=os.getenv("SECRET_KEY", "dev-troque-em-producao"),
    MAX_CONTENT_LENGTH=50 * 1024 * 1024,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
)
VAPID_PUBLIC_KEY = os.getenv("VAPID_PUBLIC_KEY", "").strip()
VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY", "").strip()
VAPID_SUBJECT = os.getenv("VAPID_SUBJECT", "mailto:admin@example.com").strip()
PUSH_EXECUTOR = ThreadPoolExecutor(max_workers=4, thread_name_prefix="simple-chat-push")


def db():
    """Abre conexão MySQL usando utf8mb4 e resultados em dicionários."""
    return pymysql.connect(
        host=os.getenv("DB_HOST", "127.0.0.1"),
        user=os.getenv("DB_USER", "simple_chat"),
        password=os.getenv("DB_PASSWORD", ""),
        database=os.getenv("DB_NAME", "simple_chat"),
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=True,
        init_command="SET time_zone = '+00:00'",
    )


def query(sql, params=(), one=False, commit=False):
    conn = db()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            if commit:
                return cur.lastrowid
            return cur.fetchone() if one else cur.fetchall()
    finally:
        conn.close()


def enviar_push_usuario(usuario_id, payload):
    if not VAPID_PUBLIC_KEY or not VAPID_PRIVATE_KEY:
        return
    subscriptions = query("SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE usuario_id=%s",
                          (usuario_id,))
    for subscription in subscriptions:
        try:
            webpush(
                subscription_info={"endpoint": subscription["endpoint"],
                                   "keys": {"p256dh": subscription["p256dh"], "auth": subscription["auth"]}},
                data=json.dumps(payload, ensure_ascii=False),
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims={"sub": VAPID_SUBJECT},
                ttl=60,
                timeout=5,
            )
        except WebPushException as error:
            status = error.response.status_code if error.response is not None else None
            if status in {404, 410}:
                query("DELETE FROM push_subscriptions WHERE id=%s", (subscription["id"],), commit=True)
            else:
                app.logger.warning("Falha ao enviar push (HTTP %s)", status or "sem resposta")
        except Exception:
            app.logger.exception("Falha inesperada ao enviar notificação push")


def agendar_push(usuario_id, payload):
    if VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY:
        PUSH_EXECUTOR.submit(enviar_push_usuario, usuario_id, payload)


def login_required(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        if "uid" not in session:
            return jsonify(erro="Não autenticado"), 401
        if request.endpoint not in {"eu", "logout", "atualizar_email"}:
            if "email" not in session:
                perfil = query("SELECT email FROM usuarios WHERE id=%s", (session["uid"],), one=True)
                session["email"] = perfil.get("email") if perfil else None
            if not session.get("email"):
                return json_erro("Adicione seu e-mail para continuar usando o Simple Chat", 403)
        return func(*args, **kwargs)
    return wrapper


def api_usuario(row):
    foto = row.get("foto_perfil")
    return {"id": row["id"], "username": row["username"],
            "nome_completo": row.get("nome_completo", row["username"]),
            "email": row.get("email"),
            "nao_lidas": row.get("nao_lidas", 0),
            "foto": f"/uploads/perfil/{foto}" if foto and foto != "default.png" else None}


def extensao(nome):
    return nome.rsplit(".", 1)[-1].lower() if "." in nome else ""


def salvar_arquivo(arquivo, pasta, permitidas):
    ext = extensao(arquivo.filename or "")
    if ext not in permitidas:
        return None
    nome = f"{uuid.uuid4().hex}.{ext}"
    arquivo.save(os.path.join(pasta, nome))
    return nome


def sao_amigos(a, b):
    return query(
        """SELECT id FROM amizades WHERE status='ACEITO' AND
           ((de_usuario_id=%s AND para_usuario_id=%s) OR
            (de_usuario_id=%s AND para_usuario_id=%s))""",
        (a, b, b, a), one=True) is not None


def nome_usuario_valido(username):
    return (3 <= len(username) <= 30 and username.isascii()
            and all(33 <= ord(char) <= 126 for char in username)
            and username == username.lower())


def senha_forte(senha):
    return (len(senha) >= 10 and re.search(r"[a-z]", senha)
            and re.search(r"[A-Z]", senha) and re.search(r"[0-9]", senha)
            and re.search(r"[^A-Za-z0-9]", senha))


def validar_perfil(nome_completo, nascimento_raw, sexo):
    if not 2 <= len(nome_completo) <= 120:
        return None, "Informe seu nome completo (2 a 120 caracteres)"
    try:
        nascimento = date.fromisoformat(nascimento_raw)
    except ValueError:
        return None, "Data de nascimento inválida"
    if nascimento > date.today():
        return None, "A data de nascimento não pode ser futura"
    if sexo not in SEXO_VALIDOS:
        return None, "Selecione uma opção para sexo"
    return nascimento, None


def email_valido(email):
    return len(email) <= 254 and re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email) is not None


def json_erro(mensagem, status):
    return jsonify(erro=mensagem), status


@app.errorhandler(HTTPException)
def erro_http(error):
    return json_erro(error.description, error.code or 500)


@app.errorhandler(Exception)
def erro_inesperado(error):
    app.logger.exception("Erro inesperado na requisição")
    return json_erro("Erro interno do servidor", 500)


@app.route("/")
def index():
    return app.send_static_file("index.html")


@app.get("/api/push/public-key")
def chave_push_publica():
    if not VAPID_PUBLIC_KEY:
        return json_erro("As notificações push ainda não foram configuradas no servidor", 503)
    return jsonify(public_key=VAPID_PUBLIC_KEY)


@app.post("/api/push/subscribe")
@login_required
def registrar_push():
    dados = request.get_json(silent=True) or {}
    endpoint = dados.get("endpoint")
    keys = dados.get("keys") or {}
    p256dh = keys.get("p256dh")
    auth = keys.get("auth")
    if (not isinstance(endpoint, str) or len(endpoint) > 2048
            or urlsplit(endpoint).scheme != "https"
            or not isinstance(p256dh, str) or not isinstance(auth, str)
            or len(p256dh) > 255 or len(auth) > 255):
        return json_erro("Inscrição de notificações inválida", 400)
    endpoint_hash = hashlib.sha256(endpoint.encode("utf-8")).hexdigest()
    query("""INSERT INTO push_subscriptions (usuario_id, endpoint, endpoint_hash, p256dh, auth)
              VALUES (%s,%s,%s,%s,%s)
              ON DUPLICATE KEY UPDATE usuario_id=VALUES(usuario_id), endpoint=VALUES(endpoint),
                p256dh=VALUES(p256dh), auth=VALUES(auth)""",
          (session["uid"], endpoint, endpoint_hash, p256dh, auth), commit=True)
    return jsonify(ok=True)


@app.post("/api/push/unsubscribe")
@login_required
def remover_push():
    endpoint = (request.get_json(silent=True) or {}).get("endpoint")
    if not isinstance(endpoint, str) or len(endpoint) > 2048:
        return json_erro("Inscrição de notificações inválida", 400)
    endpoint_hash = hashlib.sha256(endpoint.encode("utf-8")).hexdigest()
    query("DELETE FROM push_subscriptions WHERE usuario_id=%s AND endpoint_hash=%s",
          (session["uid"], endpoint_hash), commit=True)
    return jsonify(ok=True)


@app.route("/uploads/<path:caminho>")
def uploads(caminho):
    return send_from_directory(UPLOAD_DIR, caminho)


@app.post("/api/cadastro")
def cadastro():
    username = request.form.get("username") or ""
    nome_completo = (request.form.get("nome_completo") or "").strip()
    nascimento_raw = request.form.get("data_nascimento") or ""
    sexo = request.form.get("sexo") or ""
    email = (request.form.get("email") or "").strip().lower()
    senha = request.form.get("senha") or ""
    if not nome_usuario_valido(username):
        return json_erro("Usuário: use 3 a 30 caracteres, somente minúsculas, sem espaços ou acentos", 400)
    nascimento, erro = validar_perfil(nome_completo, nascimento_raw, sexo)
    if erro:
        return json_erro(erro, 400)
    if not email_valido(email):
        return json_erro("Informe um e-mail válido", 400)
    if not senha_forte(senha):
        return json_erro("A senha precisa ter 10 caracteres, maiúscula, minúscula, número e símbolo", 400)
    foto_nome = "default.png"
    arquivo = request.files.get("foto")
    if arquivo and arquivo.filename:
        foto_nome = salvar_arquivo(arquivo, PASTA_PERFIL, EXT_IMAGEM)
        if foto_nome is None:
            return json_erro("Formato de imagem inválido", 400)
    try:
        uid = query("""INSERT INTO usuarios
                    (nome_completo, data_nascimento, sexo, username, email, senha, foto_perfil)
                    VALUES (%s,%s,%s,%s,%s,%s,%s)""",
                    (nome_completo, nascimento, sexo, username, email,
                     generate_password_hash(senha), foto_nome), commit=True)
    except pymysql.err.IntegrityError:
        return json_erro("Usuário ou e-mail já cadastrado", 409)
    session.clear()
    session["uid"] = uid
    session["email"] = email
    return jsonify(id=uid, username=username, nome_completo=nome_completo, email=email,
                   foto=f"/uploads/perfil/{foto_nome}" if foto_nome != "default.png" else None), 201


@app.post("/api/login")
def login():
    dados = request.get_json(silent=True) or {}
    usuario = query("SELECT id, username, nome_completo, email, senha, foto_perfil FROM usuarios WHERE username=%s",
                    (dados.get("username", ""),), one=True)
    if not usuario or not check_password_hash(usuario["senha"], dados.get("senha", "")):
        return json_erro("Usuário ou senha inválidos", 401)
    session.clear()
    session["uid"] = usuario["id"]
    session["email"] = usuario["email"]
    return jsonify(api_usuario(usuario))


@app.post("/api/logout")
def logout():
    session.clear()
    return jsonify(ok=True)


@app.get("/api/eu")
@login_required
def eu():
    usuario = query("SELECT id, username, nome_completo, email, foto_perfil FROM usuarios WHERE id=%s",
                    (session["uid"],), one=True)
    if not usuario:
        session.clear()
        return json_erro("Não autenticado", 401)
    return jsonify(api_usuario(usuario))


@app.post("/api/perfil/foto")
@login_required
def atualizar_foto():
    arquivo = request.files.get("foto")
    if not arquivo or not arquivo.filename:
        return json_erro("Envie uma foto", 400)
    nome = salvar_arquivo(arquivo, PASTA_PERFIL, EXT_IMAGEM)
    if nome is None:
        return json_erro("Formato de imagem inválido", 400)
    query("UPDATE usuarios SET foto_perfil=%s WHERE id=%s", (nome, session["uid"]), commit=True)
    return jsonify(foto=f"/uploads/perfil/{nome}")


@app.get("/api/perfil/dados")
@login_required
def dados_perfil():
    usuario = query("""SELECT nome_completo, data_nascimento, sexo, username, email
                       FROM usuarios WHERE id=%s""", (session["uid"],), one=True)
    if not usuario:
        session.clear()
        return json_erro("Não autenticado", 401)
    usuario["data_nascimento"] = usuario["data_nascimento"].isoformat()
    return jsonify(usuario)


@app.post("/api/perfil/email")
@login_required
def atualizar_email():
    email = (request.get_json(silent=True) or {}).get("email")
    if not isinstance(email, str):
        return json_erro("Informe um e-mail válido", 400)
    email = email.strip().lower()
    if not email_valido(email):
        return json_erro("Informe um e-mail válido", 400)
    try:
        query("UPDATE usuarios SET email=%s WHERE id=%s", (email, session["uid"]), commit=True)
    except pymysql.err.IntegrityError:
        return json_erro("Esse e-mail já está em uso", 409)
    session["email"] = email
    return jsonify(ok=True, email=email)


@app.post("/api/perfil/atualizar")
@login_required
def atualizar_perfil():
    dados = request.get_json(silent=True) or {}
    uid = session["uid"]
    username = dados.get("username") or ""
    nome_completo = (dados.get("nome_completo") or "").strip()
    nascimento_raw = dados.get("data_nascimento") or ""
    sexo = dados.get("sexo") or ""
    senha_atual = dados.get("senha_atual") or ""
    nova_senha = dados.get("nova_senha") or ""
    email = dados.get("email")
    if not isinstance(email, str):
        return json_erro("Informe um e-mail válido", 400)
    email = email.strip().lower()
    usuario = query("SELECT senha FROM usuarios WHERE id=%s", (uid,), one=True)
    if not usuario or not check_password_hash(usuario["senha"], senha_atual):
        return json_erro("Senha atual incorreta", 403)
    if not nome_usuario_valido(username):
        return json_erro("Usuário: use 3 a 30 caracteres, somente minúsculas, sem espaços ou acentos", 400)
    nascimento, erro = validar_perfil(nome_completo, nascimento_raw, sexo)
    if erro:
        return json_erro(erro, 400)
    if not email_valido(email):
        return json_erro("Informe um e-mail válido", 400)
    if nova_senha and not senha_forte(nova_senha):
        return json_erro("A nova senha precisa ter 10 caracteres, maiúscula, minúscula, número e símbolo", 400)
    senha_hash = generate_password_hash(nova_senha) if nova_senha else usuario["senha"]
    try:
        query("""UPDATE usuarios SET nome_completo=%s, data_nascimento=%s, sexo=%s,
                  username=%s, email=%s, senha=%s WHERE id=%s""",
              (nome_completo, nascimento, sexo, username, email, senha_hash, uid), commit=True)
    except pymysql.err.IntegrityError:
        return json_erro("Esse nome de usuário ou e-mail já está em uso", 409)
    return jsonify(ok=True, username=username, nome_completo=nome_completo, email=email)


@app.get("/api/usuarios/buscar")
@login_required
def buscar_usuarios():
    termo = (request.args.get("q") or "").strip()
    if len(termo) < 2:
        return jsonify([])
    rows = query("""SELECT id, username, nome_completo, foto_perfil FROM usuarios
                   WHERE username LIKE %s AND id<>%s ORDER BY username LIMIT 20""",
                 (f"%{termo}%", session["uid"]))
    return jsonify([api_usuario(row) for row in rows])


@app.post("/api/amizades/solicitar")
@login_required
def solicitar():
    alvo = (request.get_json(silent=True) or {}).get("usuario_id")
    eu_id = session["uid"]
    if not isinstance(alvo, int) or alvo == eu_id:
        return json_erro("Usuário inválido", 400)
    if not query("SELECT id FROM usuarios WHERE id=%s", (alvo,), one=True):
        return json_erro("Usuário não encontrado", 404)
    existe = query("""SELECT id FROM amizades WHERE
                     (de_usuario_id=%s AND para_usuario_id=%s) OR
                     (de_usuario_id=%s AND para_usuario_id=%s)""",
                   (eu_id, alvo, alvo, eu_id), one=True)
    if existe:
        return json_erro("Já existe uma solicitação ou amizade", 409)
    query("INSERT INTO amizades (de_usuario_id, para_usuario_id) VALUES (%s,%s)",
          (eu_id, alvo), commit=True)
    return jsonify(ok=True), 201


@app.get("/api/amizades/pendentes")
@login_required
def pendentes():
    rows = query("""SELECT a.id AS amizade_id, u.id, u.username, u.foto_perfil
                   FROM amizades a JOIN usuarios u ON u.id=a.de_usuario_id
                   WHERE a.para_usuario_id=%s AND a.status='PENDENTE'
                   ORDER BY a.criado_em""", (session["uid"],))
    return jsonify([{"amizade_id": r["amizade_id"], **api_usuario(r)} for r in rows])


@app.post("/api/amizades/aceitar")
@login_required
def aceitar():
    aid = (request.get_json(silent=True) or {}).get("amizade_id")
    if not isinstance(aid, int):
        return json_erro("Solicitação inválida", 400)
    query("""UPDATE amizades SET status='ACEITO'
            WHERE id=%s AND para_usuario_id=%s AND status='PENDENTE'""",
          (aid, session["uid"]), commit=True)
    # Uma operação UPDATE não retorna lastrowid; confirme o estado após atualizar.
    confirmacao = query("SELECT id FROM amizades WHERE id=%s AND para_usuario_id=%s AND status='ACEITO'",
                        (aid, session["uid"]), one=True)
    if not confirmacao:
        return json_erro("Solicitação não encontrada", 404)
    return jsonify(ok=True)


def eh_membro_grupo(grupo_id, usuario_id):
    return query("SELECT grupo_id FROM grupo_membros WHERE grupo_id=%s AND usuario_id=%s",
                 (grupo_id, usuario_id), one=True) is not None


@app.get("/api/grupos")
@login_required
def listar_grupos():
    uid = session["uid"]
    rows = query("""SELECT g.id, g.nome, g.criador_id,
                          (SELECT COUNT(*) FROM mencoes_grupo x
                           JOIN mensagens_grupo msg ON msg.id=x.mensagem_id
                           WHERE msg.grupo_id=g.id AND x.usuario_id=%s AND x.lida=0
                             AND msg.apagada=0 AND NOT EXISTS (
                               SELECT 1 FROM mensagens_grupo_ocultas h
                               WHERE h.mensagem_id=msg.id AND h.usuario_id=%s)) AS mencoes_nao_lidas
                   FROM chat_grupos g
                   JOIN grupo_membros m ON m.grupo_id=g.id
                   WHERE m.usuario_id=%s ORDER BY g.nome""", (uid, uid, uid))
    return jsonify(rows)


@app.post("/api/grupos")
@login_required
def criar_grupo():
    nome = ((request.get_json(silent=True) or {}).get("nome") or "").strip()
    if not 2 <= len(nome) <= 80:
        return json_erro("O nome do grupo deve ter de 2 a 80 caracteres", 400)
    uid = session["uid"]
    conn = db()
    try:
        conn.begin()
        with conn.cursor() as cur:
            cur.execute("INSERT INTO chat_grupos (nome, criador_id) VALUES (%s,%s)", (nome, uid))
            grupo_id = cur.lastrowid
            cur.execute("INSERT INTO grupo_membros (grupo_id, usuario_id) VALUES (%s,%s)", (grupo_id, uid))
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    return jsonify(id=grupo_id, nome=nome, criador_id=uid), 201


@app.post("/api/grupos/<int:grupo_id>/convites")
@login_required
def convidar_para_grupo(grupo_id):
    uid = session["uid"]
    alvo = (request.get_json(silent=True) or {}).get("usuario_id")
    grupo = query("SELECT id, criador_id FROM chat_grupos WHERE id=%s", (grupo_id,), one=True)
    if not grupo or grupo["criador_id"] != uid:
        return json_erro("Somente quem criou o grupo pode convidar pessoas", 403)
    if not isinstance(alvo, int) or alvo == uid or not sao_amigos(uid, alvo):
        return json_erro("Convide uma pessoa que já seja sua amiga", 400)
    if eh_membro_grupo(grupo_id, alvo):
        return json_erro("Essa pessoa já participa do grupo", 409)
    convite = query("SELECT id, status FROM grupo_convites WHERE grupo_id=%s AND convidado_id=%s",
                    (grupo_id, alvo), one=True)
    if convite and convite["status"] == "PENDENTE":
        return json_erro("Já existe um convite pendente para essa pessoa", 409)
    if convite:
        query("""UPDATE grupo_convites SET convidante_id=%s, status='PENDENTE', criado_em=CURRENT_TIMESTAMP
                  WHERE id=%s""", (uid, convite["id"]), commit=True)
    else:
        query("""INSERT INTO grupo_convites (grupo_id, convidante_id, convidado_id)
                  VALUES (%s,%s,%s)""", (grupo_id, uid, alvo), commit=True)
    return jsonify(ok=True), 201


@app.get("/api/grupos/convites")
@login_required
def convites_grupo():
    rows = query("""SELECT i.id AS convite_id, g.id AS grupo_id, g.nome AS grupo_nome,
                          u.username AS convidado_por
                   FROM grupo_convites i JOIN chat_grupos g ON g.id=i.grupo_id
                   JOIN usuarios u ON u.id=i.convidante_id
                   WHERE i.convidado_id=%s AND i.status='PENDENTE'
                   ORDER BY i.criado_em""", (session["uid"],))
    return jsonify(rows)


@app.get("/api/grupos/<int:grupo_id>/membros")
@login_required
def membros_grupo(grupo_id):
    if not eh_membro_grupo(grupo_id, session["uid"]):
        return json_erro("Você não participa desse grupo", 403)
    rows = query("""SELECT u.id, u.username, u.nome_completo, u.foto_perfil FROM grupo_membros m
                   JOIN usuarios u ON u.id=m.usuario_id
                   WHERE m.grupo_id=%s ORDER BY u.username""", (grupo_id,))
    return jsonify([api_usuario(row) for row in rows])


@app.post("/api/grupos/convites/<int:convite_id>/aceitar")
@login_required
def aceitar_convite_grupo(convite_id):
    conn = db()
    try:
        conn.begin()
        with conn.cursor() as cur:
            cur.execute("""SELECT grupo_id FROM grupo_convites
                           WHERE id=%s AND convidado_id=%s AND status='PENDENTE' FOR UPDATE""",
                        (convite_id, session["uid"]))
            convite = cur.fetchone()
            if not convite:
                conn.rollback()
                return json_erro("Convite não encontrado", 404)
            cur.execute("INSERT INTO grupo_membros (grupo_id, usuario_id) VALUES (%s,%s)",
                        (convite["grupo_id"], session["uid"]))
            cur.execute("UPDATE grupo_convites SET status='ACEITO' WHERE id=%s", (convite_id,))
        conn.commit()
    except pymysql.err.IntegrityError:
        conn.rollback()
        return json_erro("Você já participa desse grupo", 409)
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    return jsonify(ok=True)


@app.post("/api/grupos/convites/<int:convite_id>/recusar")
@login_required
def recusar_convite_grupo(convite_id):
    query("""UPDATE grupo_convites SET status='RECUSADO'
              WHERE id=%s AND convidado_id=%s AND status='PENDENTE'""",
          (convite_id, session["uid"]), commit=True)
    return jsonify(ok=True)


@app.get("/api/grupos/<int:grupo_id>/mensagens")
@login_required
def historico_grupo(grupo_id):
    uid = session["uid"]
    if not eh_membro_grupo(grupo_id, uid):
        return json_erro("Você não participa desse grupo", 403)
    apos_id = max(request.args.get("apos_id", 0, type=int), 0)
    rows = query("""SELECT m.id, m.remetente_id, u.username AS remetente_username,
                          m.tipo, m.conteudo, m.enviado_em, m.apagada,
                          m.resposta_id AS reply_id, r.tipo AS reply_tipo,
                          r.conteudo AS reply_conteudo, ru.username AS reply_username,
                          r.apagada AS reply_apagada,
                          EXISTS(SELECT 1 FROM mencoes_grupo x WHERE x.mensagem_id=m.id
                                 AND x.usuario_id=%s) AS menciona_me
                   FROM mensagens_grupo m JOIN usuarios u ON u.id=m.remetente_id
                   LEFT JOIN mensagens_grupo r ON r.id=m.resposta_id
                   LEFT JOIN usuarios ru ON ru.id=r.remetente_id
                   WHERE m.grupo_id=%s AND (m.id>%s OR m.apagada=1)
                     AND NOT EXISTS (SELECT 1 FROM mensagens_grupo_ocultas h
                                     WHERE h.mensagem_id=m.id AND h.usuario_id=%s)
                   ORDER BY m.id""", (uid, grupo_id, apos_id, uid))
    for row in rows:
        row["resposta"] = ({"id": row["reply_id"], "tipo": row["reply_tipo"],
                            "conteudo": "Mensagem apagada" if row["reply_apagada"] else row["reply_conteudo"],
                            "username": row["reply_username"], "apagada": row["reply_apagada"]}
                           if row["reply_id"] else None)
        for key in ("reply_id", "reply_tipo", "reply_conteudo", "reply_username", "reply_apagada"):
            row.pop(key, None)
    if apos_id == 0:
        query("""UPDATE mencoes_grupo x JOIN mensagens_grupo m ON m.id=x.mensagem_id
                  SET x.lida=1 WHERE m.grupo_id=%s AND x.usuario_id=%s AND x.lida=0""",
              (grupo_id, session["uid"]), commit=True)
    elif any(row["menciona_me"] for row in rows):
        query("""UPDATE mencoes_grupo x JOIN mensagens_grupo m ON m.id=x.mensagem_id
                  SET x.lida=1 WHERE m.grupo_id=%s AND x.usuario_id=%s
                  AND m.id>%s AND x.lida=0""", (grupo_id, session["uid"], apos_id), commit=True)
    for row in rows:
        row["enviado_em"] = iso_data(row["enviado_em"])
    return jsonify(rows)


@app.post("/api/grupos/<int:grupo_id>/mensagens/<int:mensagem_id>/apagar")
@login_required
def apagar_mensagem_grupo(grupo_id, mensagem_id):
    uid = session["uid"]
    if not eh_membro_grupo(grupo_id, uid):
        return json_erro("VocÃª nÃ£o participa desse grupo", 403)
    dados = request.get_json(silent=True) or {}
    para_todos = dados.get("para_todos") is True
    mensagem = query("SELECT id, remetente_id FROM mensagens_grupo WHERE id=%s AND grupo_id=%s",
                     (mensagem_id, grupo_id), one=True)
    if not mensagem:
        return json_erro("Mensagem nÃ£o encontrada", 404)
    if para_todos:
        if mensagem["remetente_id"] != uid:
            return json_erro("SÃ³ quem enviou pode apagar a mensagem para todos", 403)
        query("UPDATE mensagens_grupo SET apagada=1, conteudo=NULL WHERE id=%s", (mensagem_id,), commit=True)
        query("UPDATE mencoes_grupo SET lida=1 WHERE mensagem_id=%s", (mensagem_id,), commit=True)
    else:
        query("INSERT IGNORE INTO mensagens_grupo_ocultas (mensagem_id, usuario_id) VALUES (%s,%s)",
              (mensagem_id, uid), commit=True)
        query("UPDATE mencoes_grupo SET lida=1 WHERE mensagem_id=%s AND usuario_id=%s",
              (mensagem_id, uid), commit=True)
    return jsonify(ok=True)


@app.post("/api/grupos/<int:grupo_id>/mensagens")
@login_required
def enviar_mensagem_grupo(grupo_id):
    uid = session["uid"]
    if not eh_membro_grupo(grupo_id, uid):
        return json_erro("Você não participa desse grupo", 403)
    if request.is_json:
        dados = request.get_json(silent=True) or {}
        texto = (dados.get("texto") or "").strip()
        resposta_id = dados.get("resposta_id")
        mencoes = dados.get("mencoes") or []
        arquivo = None
    else:
        texto = (request.form.get("texto") or "").strip()
        resposta_id = request.form.get("resposta_id", type=int)
        try:
            mencoes = [int(valor) for valor in request.form.get("mencoes", "").split(",") if valor]
        except ValueError:
            return json_erro("Menções inválidas", 400)
        arquivo = request.files.get("arquivo")
    if resposta_id is not None:
        if not isinstance(resposta_id, int) or not query(
                "SELECT id FROM mensagens_grupo WHERE id=%s AND grupo_id=%s",
                (resposta_id, grupo_id), one=True):
            return json_erro("Mensagem respondida não encontrada neste grupo", 400)
    if arquivo and arquivo.filename:
        ext = extensao(arquivo.filename)
        if ext not in EXT_IMAGEM | EXT_VIDEO:
            return json_erro("Tipo de arquivo não permitido", 400)
        tipo = "IMAGEM" if ext in EXT_IMAGEM else "VIDEO"
        nome = salvar_arquivo(arquivo, PASTA_MIDIA, EXT_IMAGEM | EXT_VIDEO)
        conteudo = f"/uploads/midia/{nome}"
    elif texto:
        if len(texto) > 2000:
            return json_erro("A mensagem pode ter no máximo 2000 caracteres", 400)
        tipo, conteudo = "TEXTO", texto
    else:
        return json_erro("Mensagem vazia", 400)
    if not isinstance(mencoes, list) or any(not isinstance(value, int) for value in mencoes):
        return json_erro("Menções inválidas", 400)
    mencoes = list(dict.fromkeys(value for value in mencoes if value != uid))
    membros = query("""SELECT u.id, u.username FROM grupo_membros m JOIN usuarios u ON u.id=m.usuario_id
                      WHERE m.grupo_id=%s AND u.id<>%s""", (grupo_id, uid))
    usernames = {member["id"]: member["username"] for member in membros}
    tokens = set(texto.split())
    for mencionado_id in mencoes:
        if mencionado_id not in usernames or f"@{usernames[mencionado_id]}" not in tokens:
            return json_erro("Uma pessoa mencionada não pertence ao grupo ou não está marcada no texto", 400)
    conn = db()
    try:
        conn.begin()
        with conn.cursor() as cur:
            cur.execute("""INSERT INTO mensagens_grupo
                           (grupo_id, remetente_id, tipo, conteudo, resposta_id)
                           VALUES (%s,%s,%s,%s,%s)""",
                        (grupo_id, uid, tipo, conteudo, resposta_id))
            mid = cur.lastrowid
            if mencoes:
                cur.executemany("INSERT INTO mencoes_grupo (mensagem_id, usuario_id) VALUES (%s,%s)",
                                [(mid, mencionado_id) for mencionado_id in mencoes])
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    grupo_nome = query("SELECT nome FROM chat_grupos WHERE id=%s", (grupo_id,), one=True)["nome"]
    remetente = query("SELECT username FROM usuarios WHERE id=%s", (uid,), one=True)["username"]
    resumo = texto[:150] if tipo == "TEXTO" else ("Enviou uma imagem" if tipo == "IMAGEM" else "Enviou um vídeo")
    destinatarios = query("SELECT usuario_id FROM grupo_membros WHERE grupo_id=%s AND usuario_id<>%s",
                          (grupo_id, uid))
    mencionados = set(mencoes)
    for membro in destinatarios:
        citado = membro["usuario_id"] in mencionados
        agendar_push(membro["usuario_id"], {
            "title": f"{remetente} mencionou você em {grupo_nome}" if citado else f"Nova mensagem em {grupo_nome}",
            "body": resumo,
            "tag": f"grupo-{grupo_id}",
            "url": f"/?grupo={grupo_id}",
        })
    return jsonify(id=mid, tipo=tipo, conteudo=conteudo), 201


@app.get("/api/amigos")
@login_required
def amigos():
    uid = session["uid"]
    rows = query("""SELECT u.id, u.username, u.nome_completo, u.foto_perfil,
                          (SELECT COUNT(*) FROM mensagens m WHERE m.remetente_id=u.id
                           AND m.destinatario_id=%s AND m.lida=0 AND m.apagada=0
                           AND NOT EXISTS (SELECT 1 FROM mensagens_ocultas h
                                           WHERE h.mensagem_id=m.id AND h.usuario_id=%s)) AS nao_lidas
                   FROM amizades a
                   JOIN usuarios u ON u.id=IF(a.de_usuario_id=%s,a.para_usuario_id,a.de_usuario_id)
                   WHERE a.status='ACEITO' AND (a.de_usuario_id=%s OR a.para_usuario_id=%s)
                   ORDER BY u.nome_completo, u.username""", (uid, uid, uid, uid, uid, uid))
    return jsonify([api_usuario(row) for row in rows])


@app.post("/api/mensagens")
@login_required
def enviar_mensagem():
    uid = session["uid"]
    if request.is_json:
        dados = request.get_json(silent=True) or {}
        dest = dados.get("destinatario_id")
        texto = (dados.get("texto") or "").strip()
        arquivo = None
    else:
        dest = request.form.get("destinatario_id", type=int)
        texto = (request.form.get("texto") or "").strip()
        arquivo = request.files.get("arquivo")
    if not isinstance(dest, int):
        return json_erro("Destinatário inválido", 400)
    if not sao_amigos(uid, dest):
        return json_erro("Vocês não são amigos", 403)
    resposta_id = (request.get_json(silent=True) or {}).get("resposta_id") if request.is_json else request.form.get("resposta_id", type=int)
    if resposta_id is not None and (not isinstance(resposta_id, int) or not query(
            "SELECT id FROM mensagens WHERE id=%s AND ((remetente_id=%s AND destinatario_id=%s) OR (remetente_id=%s AND destinatario_id=%s))",
            (resposta_id, uid, dest, dest, uid), one=True)):
        return json_erro("Mensagem respondida não encontrada nesta conversa", 400)
    if arquivo and arquivo.filename:
        ext = extensao(arquivo.filename)
        if ext not in EXT_IMAGEM | EXT_VIDEO:
            return json_erro("Tipo de arquivo não permitido", 400)
        tipo = "IMAGEM" if ext in EXT_IMAGEM else "VIDEO"
        nome = salvar_arquivo(arquivo, PASTA_MIDIA, EXT_IMAGEM | EXT_VIDEO)
        conteudo = f"/uploads/midia/{nome}"
    elif texto:
        if len(texto) > 2000:
            return json_erro("A mensagem pode ter no máximo 2000 caracteres", 400)
        tipo, conteudo = "TEXTO", texto
    else:
        return json_erro("Mensagem vazia", 400)
    mid = query("INSERT INTO mensagens (remetente_id,destinatario_id,tipo,conteudo,resposta_id) VALUES (%s,%s,%s,%s,%s)",
                (uid, dest, tipo, conteudo, resposta_id), commit=True)
    remetente = query("SELECT username FROM usuarios WHERE id=%s", (uid,), one=True)["username"]
    resumo = texto[:150] if tipo == "TEXTO" else ("Enviou uma imagem" if tipo == "IMAGEM" else "Enviou um vídeo")
    agendar_push(dest, {"title": f"Nova mensagem de {remetente}", "body": resumo,
                        "tag": f"privado-{uid}", "url": f"/?contato={uid}"})
    return jsonify(id=mid, tipo=tipo, conteudo=conteudo), 201


def iso_data(valor):
    if isinstance(valor, datetime):
        if valor.tzinfo is None:
            valor = valor.replace(tzinfo=timezone.utc)
        return valor.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    return valor.isoformat() if isinstance(valor, date) else valor


@app.get("/api/mensagens/<int:amigo_id>")
@login_required
def historico(amigo_id):
    uid = session["uid"]
    if not sao_amigos(uid, amigo_id):
        return json_erro("Vocês não são amigos", 403)
    apos_id = max(request.args.get("apos_id", 0, type=int), 0)
    rows = query("""SELECT m.id, m.remetente_id, m.tipo, m.conteudo, m.enviado_em, m.apagada,
                          m.resposta_id AS reply_id, r.tipo AS reply_tipo,
                          r.conteudo AS reply_conteudo, ru.username AS reply_username,
                          r.apagada AS reply_apagada
                   FROM mensagens m LEFT JOIN mensagens r ON r.id=m.resposta_id
                   LEFT JOIN usuarios ru ON ru.id=r.remetente_id
                   WHERE (m.id>%s OR m.apagada=1) AND ((m.remetente_id=%s AND m.destinatario_id=%s) OR
                   (m.remetente_id=%s AND m.destinatario_id=%s))
                     AND NOT EXISTS (SELECT 1 FROM mensagens_ocultas h
                                     WHERE h.mensagem_id=m.id AND h.usuario_id=%s)
                   ORDER BY m.id""",
                 (apos_id, uid, amigo_id, amigo_id, uid, uid))
    for row in rows:
        row["resposta"] = ({"id": row["reply_id"], "tipo": row["reply_tipo"],
                            "conteudo": "Mensagem apagada" if row["reply_apagada"] else row["reply_conteudo"],
                            "username": row["reply_username"], "apagada": row["reply_apagada"]}
                           if row["reply_id"] else None)
        for key in ("reply_id", "reply_tipo", "reply_conteudo", "reply_username", "reply_apagada"):
            row.pop(key, None)
    if apos_id == 0:
        query("UPDATE mensagens SET lida=1 WHERE remetente_id=%s AND destinatario_id=%s AND lida=0 AND apagada=0",
              (amigo_id, uid), commit=True)
    elif any(row["remetente_id"] == amigo_id for row in rows):
        query("""UPDATE mensagens SET lida=1 WHERE remetente_id=%s AND destinatario_id=%s
                  AND id>%s AND lida=0 AND apagada=0""", (amigo_id, uid, apos_id), commit=True)
    for row in rows:
        row["enviado_em"] = iso_data(row["enviado_em"])
    return jsonify(rows)


@app.post("/api/mensagens/<int:mensagem_id>/apagar")
@login_required
def apagar_mensagem(mensagem_id):
    uid = session["uid"]
    dados = request.get_json(silent=True) or {}
    para_todos = dados.get("para_todos") is True
    mensagem = query("""SELECT id, remetente_id FROM mensagens WHERE id=%s
                       AND (remetente_id=%s OR destinatario_id=%s)""",
                     (mensagem_id, uid, uid), one=True)
    if not mensagem:
        return json_erro("Mensagem nÃ£o encontrada", 404)
    if para_todos:
        if mensagem["remetente_id"] != uid:
            return json_erro("SÃ³ quem enviou pode apagar a mensagem para todos", 403)
        query("UPDATE mensagens SET apagada=1, conteudo=NULL, lida=1 WHERE id=%s", (mensagem_id,), commit=True)
    else:
        query("INSERT IGNORE INTO mensagens_ocultas (mensagem_id, usuario_id) VALUES (%s,%s)",
              (mensagem_id, uid), commit=True)
    return jsonify(ok=True)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
