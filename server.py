"""API Flask do simple_chat."""
import os
import re
import uuid
from datetime import date, datetime, timezone
from functools import wraps

import pymysql
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


def login_required(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        if "uid" not in session:
            return jsonify(erro="Não autenticado"), 401
        return func(*args, **kwargs)
    return wrapper


def api_usuario(row):
    foto = row.get("foto_perfil")
    return {"id": row["id"], "username": row["username"],
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


@app.route("/uploads/<path:caminho>")
def uploads(caminho):
    return send_from_directory(UPLOAD_DIR, caminho)


@app.post("/api/cadastro")
def cadastro():
    username = request.form.get("username") or ""
    nome_completo = (request.form.get("nome_completo") or "").strip()
    nascimento_raw = request.form.get("data_nascimento") or ""
    sexo = request.form.get("sexo") or ""
    senha = request.form.get("senha") or ""
    if not nome_usuario_valido(username):
        return json_erro("Usuário: use 3 a 30 caracteres, somente minúsculas, sem espaços ou acentos", 400)
    nascimento, erro = validar_perfil(nome_completo, nascimento_raw, sexo)
    if erro:
        return json_erro(erro, 400)
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
                    (nome_completo, data_nascimento, sexo, username, senha, foto_perfil)
                    VALUES (%s,%s,%s,%s,%s,%s)""",
                    (nome_completo, nascimento, sexo, username,
                     generate_password_hash(senha), foto_nome), commit=True)
    except pymysql.err.IntegrityError:
        return json_erro("Usuário já existe", 409)
    session.clear()
    session["uid"] = uid
    return jsonify(id=uid, username=username,
                   foto=f"/uploads/perfil/{foto_nome}" if foto_nome != "default.png" else None), 201


@app.post("/api/login")
def login():
    dados = request.get_json(silent=True) or {}
    usuario = query("SELECT id, username, senha, foto_perfil FROM usuarios WHERE username=%s",
                    (dados.get("username", ""),), one=True)
    if not usuario or not check_password_hash(usuario["senha"], dados.get("senha", "")):
        return json_erro("Usuário ou senha inválidos", 401)
    session.clear()
    session["uid"] = usuario["id"]
    return jsonify(api_usuario(usuario))


@app.post("/api/logout")
def logout():
    session.clear()
    return jsonify(ok=True)


@app.get("/api/eu")
@login_required
def eu():
    usuario = query("SELECT id, username, foto_perfil FROM usuarios WHERE id=%s",
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
    usuario = query("""SELECT nome_completo, data_nascimento, sexo, username
                       FROM usuarios WHERE id=%s""", (session["uid"],), one=True)
    if not usuario:
        session.clear()
        return json_erro("Não autenticado", 401)
    usuario["data_nascimento"] = usuario["data_nascimento"].isoformat()
    return jsonify(usuario)


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
    usuario = query("SELECT senha FROM usuarios WHERE id=%s", (uid,), one=True)
    if not usuario or not check_password_hash(usuario["senha"], senha_atual):
        return json_erro("Senha atual incorreta", 403)
    if not nome_usuario_valido(username):
        return json_erro("Usuário: use 3 a 30 caracteres, somente minúsculas, sem espaços ou acentos", 400)
    nascimento, erro = validar_perfil(nome_completo, nascimento_raw, sexo)
    if erro:
        return json_erro(erro, 400)
    if nova_senha and not senha_forte(nova_senha):
        return json_erro("A nova senha precisa ter 10 caracteres, maiúscula, minúscula, número e símbolo", 400)
    senha_hash = generate_password_hash(nova_senha) if nova_senha else usuario["senha"]
    try:
        query("""UPDATE usuarios SET nome_completo=%s, data_nascimento=%s, sexo=%s,
                  username=%s, senha=%s WHERE id=%s""",
              (nome_completo, nascimento, sexo, username, senha_hash, uid), commit=True)
    except pymysql.err.IntegrityError:
        return json_erro("Esse nome de usuário já está em uso", 409)
    return jsonify(ok=True, username=username)


@app.get("/api/usuarios/buscar")
@login_required
def buscar_usuarios():
    termo = (request.args.get("q") or "").strip()
    if len(termo) < 2:
        return jsonify([])
    rows = query("""SELECT id, username, foto_perfil FROM usuarios
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
    rows = query("""SELECT g.id, g.nome, g.criador_id FROM chat_grupos g
                   JOIN grupo_membros m ON m.grupo_id=g.id
                   WHERE m.usuario_id=%s ORDER BY g.nome""", (session["uid"],))
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
    rows = query("""SELECT u.id, u.username, u.foto_perfil FROM grupo_membros m
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
                          m.tipo, m.conteudo, m.enviado_em
                   FROM mensagens_grupo m JOIN usuarios u ON u.id=m.remetente_id
                   WHERE m.grupo_id=%s AND m.id>%s ORDER BY m.id""", (grupo_id, apos_id))
    for row in rows:
        row["enviado_em"] = iso_data(row["enviado_em"])
    return jsonify(rows)


@app.post("/api/grupos/<int:grupo_id>/mensagens")
@login_required
def enviar_mensagem_grupo(grupo_id):
    uid = session["uid"]
    if not eh_membro_grupo(grupo_id, uid):
        return json_erro("Você não participa desse grupo", 403)
    if request.is_json:
        texto = ((request.get_json(silent=True) or {}).get("texto") or "").strip()
        arquivo = None
    else:
        texto = (request.form.get("texto") or "").strip()
        arquivo = request.files.get("arquivo")
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
    mid = query("""INSERT INTO mensagens_grupo (grupo_id, remetente_id, tipo, conteudo)
                   VALUES (%s,%s,%s,%s)""", (grupo_id, uid, tipo, conteudo), commit=True)
    return jsonify(id=mid, tipo=tipo, conteudo=conteudo), 201


@app.get("/api/amigos")
@login_required
def amigos():
    uid = session["uid"]
    rows = query("""SELECT u.id, u.username, u.foto_perfil FROM amizades a
                   JOIN usuarios u ON u.id=IF(a.de_usuario_id=%s,a.para_usuario_id,a.de_usuario_id)
                   WHERE a.status='ACEITO' AND (a.de_usuario_id=%s OR a.para_usuario_id=%s)
                   ORDER BY u.username""", (uid, uid, uid))
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
    mid = query("INSERT INTO mensagens (remetente_id,destinatario_id,tipo,conteudo) VALUES (%s,%s,%s,%s)",
                (uid, dest, tipo, conteudo), commit=True)
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
    rows = query("""SELECT id, remetente_id, tipo, conteudo, enviado_em FROM mensagens
                   WHERE id>%s AND ((remetente_id=%s AND destinatario_id=%s) OR
                   (remetente_id=%s AND destinatario_id=%s)) ORDER BY id""",
                 (apos_id, uid, amigo_id, amigo_id, uid))
    for row in rows:
        row["enviado_em"] = iso_data(row["enviado_em"])
    return jsonify(rows)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
