"use strict";

const $ = (selector) => document.querySelector(selector);
const authScreen = $("#authScreen");
const appScreen = $("#appScreen");
const authForm = $("#authForm");
const authError = $("#authError");
const authUsername = $("#authUsername");
const authPassword = $("#authPassword");
const fullNameInput = $("#fullName");
const birthDateInput = $("#birthDate");
const sexInput = $("#sex");
const registerEmailInput = $("#registerEmail");
const registerPhoto = $("#registerPhoto");
const profilePhoto = $("#profilePhoto");
const searchInput = $("#userSearch");
const searchResults = $("#searchResults");
const pendingList = $("#pendingList");
const friendsList = $("#friendsList");
const groupsList = $("#groupsList");
const groupInvitesList = $("#groupInvitesList");
const messagesEl = $("#messages");
const messageInput = $("#messageInput");
const attachmentInput = $("#attachmentInput");
const attachmentPreview = $("#attachmentPreview");
const emojiPicker = $("#emojiPicker");
const appState = { me: null, friend: null, group: null, groups: [], groupMembers: [], friends: [], inviteGroupId: null, replyTarget: null, maxId: 0, pollTimer: null, listsTimer: null, searchTimer: null, previewUrl: null, busy: false };
const MAX_UPLOAD = 50 * 1024 * 1024;
const EMOJIS = "😀 😃 😄 😁 😆 😅 😂 🙂 🙃 😉 😊 😍 🥰 😘 😋 😎 🤩 🥳 😭 😢 😡 🤔 🙄 😴 🤗 🤝 👋 👍 👎 👏 🙌 🙏 💪 ❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💔 💕 💖 💯 🔥 ✨ ⭐ 🎉 🎂 ☕ 🍕 🌈 🐱 🐶 🌻 🌹 🚀 💬".split(" ");

// Ajusta o app à área visível quando o teclado virtual abre no celular.
function syncVisibleViewport() {
  const pane = $("#messages");
  const nearBottom = pane && pane.scrollHeight - pane.scrollTop - pane.clientHeight < 110;
  const height = window.visualViewport?.height || window.innerHeight;
  document.documentElement.style.setProperty("--visible-viewport-height", `${Math.round(height)}px`);
  if (nearBottom) {
    window.requestAnimationFrame(() => { pane.scrollTop = pane.scrollHeight; });
  }
}

syncVisibleViewport();
window.addEventListener("resize", syncVisibleViewport);
window.visualViewport?.addEventListener("resize", syncVisibleViewport);

// Helper comum para API JSON e uploads multipart.
async function api(url, options = {}) {
  let response;
  try {
    response = await fetch(url, { credentials: "same-origin", ...options });
  } catch {
    throw new Error("Não foi possível conectar. Verifique sua rede e tente novamente.");
  }
  let data = {};
  try { data = await response.json(); } catch { /* respostas sem JSON viram erro abaixo */ }
  if (response.status === 401) {
    showAuth();
    throw new Error(data.erro || "Sua sessão terminou. Entre novamente.");
  }
  if (!response.ok) throw new Error(data.erro || `Erro ${response.status}`);
  return data;
}

function setAvatar(el, user, large = false) {
  el.replaceChildren();
  el.classList.toggle("avatar-xl", large);
  el.classList.remove("group-avatar");
  const name = user?.username || "?";
  el.setAttribute("aria-label", `Foto de ${name}`);
  if (user?.foto) {
    const img = document.createElement("img");
    img.src = user.foto;
    img.alt = "";
    img.onerror = () => { el.textContent = name.charAt(0).toUpperCase(); };
    el.append(img);
  } else {
    el.textContent = name.charAt(0).toUpperCase() || "?";
  }
}

function showAuth() {
  stopChatPolling();
  stopListPolling();
  appState.friend = null;
  appState.group = null;
  appState.groupMembers = [];
  clearReplyTarget();
  hideMentionSuggestions();
  appState.me = null;
  appScreen.inert = false;
  $("#emailGate").classList.add("hidden");
  appScreen.classList.add("hidden");
  authScreen.classList.remove("hidden");
}

function showApp(user) {
  appState.me = user;
  authScreen.classList.add("hidden");
  appScreen.classList.remove("hidden");
  const hasEmail = Boolean(user.email);
  appScreen.inert = !hasEmail;
  $("#emailGate").classList.toggle("hidden", hasEmail);
  $("#myUsername").textContent = user.username;
  setAvatar($("#myAvatar"), user);
  stopListPolling();
  if (hasEmail) {
    refreshLists();
    appState.listsTimer = window.setInterval(refreshLists, 10000);
  } else {
    window.setTimeout(() => $("#accountEmail").focus(), 0);
  }
}

function stopChatPolling() {
  if (appState.pollTimer) window.clearInterval(appState.pollTimer);
  appState.pollTimer = null;
}

function stopListPolling() {
  if (appState.listsTimer) window.clearInterval(appState.listsTimer);
  appState.listsTimer = null;
}

function showError(el, message) { el.textContent = message || ""; }

function makeRow(user, actionLabel, action) {
  const row = document.createElement("div");
  row.className = "list-row";
  const avatar = document.createElement("div");
  avatar.className = "avatar";
  setAvatar(avatar, user);
  const info = document.createElement("div");
  info.className = "row-info";
  const name = document.createElement("strong");
  name.textContent = user.username;
  info.append(name);
  row.append(avatar, info);
  if (actionLabel) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "row-action";
    button.textContent = actionLabel;
    button.addEventListener("click", action);
    row.append(button);
  }
  return row;
}

async function refreshLists() {
  if (!appState.me) return;
  try {
    const [friends, pending, groups, groupInvites] = await Promise.all([
      api("/api/amigos"), api("/api/amizades/pendentes"),
      api("/api/grupos"), api("/api/grupos/convites"),
    ]);
    appState.friends = friends;
    renderFriends(friends);
    renderPending(pending);
    renderGroups(groups);
    renderGroupInvites(groupInvites);
  } catch (error) {
    if (!appState.me) return;
    console.warn("Falha ao atualizar listas:", error.message);
  }
}

function renderFriends(friends) {
  appState.friends = friends;
  friendsList.replaceChildren();
  if (!friends.length) {
    const note = document.createElement("div");
    note.className = "empty-note";
    note.textContent = "Suas conversas aparecerão aqui quando você adicionar amigos.";
    friendsList.append(note);
    return;
  }
  for (const friend of friends) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "list-row friend-row";
    row.classList.toggle("active", appState.friend?.id === friend.id);
    const avatar = document.createElement("div");
    avatar.className = "avatar";
    setAvatar(avatar, friend);
    const info = document.createElement("div");
    info.className = "row-info";
    const name = document.createElement("strong");
    name.textContent = friend.nome_completo || friend.username;
    const username = document.createElement("span");
    username.className = "contact-username";
    username.textContent = `@${friend.username}`;
    info.append(name, username);
    row.dataset.userId = String(friend.id);
    row.append(avatar, info);
    const unread = Number(friend.nao_lidas) || 0;
    if (unread) {
      const badge = document.createElement("span");
      badge.className = "unread-badge";
      badge.textContent = unread > 99 ? "99+" : String(unread);
      badge.setAttribute("aria-label", `${unread} mensagens não lidas`);
      row.append(badge);
    }
    row.addEventListener("click", () => openChat(friend));
    friendsList.append(row);
  }
}

function renderGroups(groups) {
  appState.groups = groups;
  groupsList.replaceChildren();
  if (!groups.length) {
    const note = document.createElement("div");
    note.className = "empty-note";
    note.textContent = "Seus grupos aparecerão aqui.";
    groupsList.append(note);
    return;
  }
  for (const group of groups) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "list-row friend-row group-row";
    row.classList.toggle("active", appState.group?.id === group.id);
    const avatar = document.createElement("div");
    avatar.className = "avatar group-avatar";
    avatar.textContent = group.nome.charAt(0).toUpperCase();
    const info = document.createElement("div");
    info.className = "row-info";
    const name = document.createElement("strong");
    name.textContent = group.nome;
    info.append(name);
    row.append(avatar, info);
    row.dataset.groupId = String(group.id);
    const mentions = Number(group.mencoes_nao_lidas) || 0;
    if (mentions) {
      const badge = document.createElement("span");
      badge.className = "mention-badge";
      badge.textContent = `@ ${mentions > 99 ? "99+" : mentions}`;
      badge.setAttribute("aria-label", `${mentions} menções não lidas`);
      row.append(badge);
    }
    row.addEventListener("click", () => openGroupChat(group));
    groupsList.append(row);
  }
}

function renderGroupInvites(invites) {
  groupInvitesList.replaceChildren();
  $("#groupInviteCount").textContent = String(invites.length);
  for (const invite of invites) {
    const row = document.createElement("div");
    row.className = "list-row group-invite-row";
    const avatar = document.createElement("div");
    avatar.className = "avatar group-avatar";
    avatar.textContent = invite.grupo_nome.charAt(0).toUpperCase();
    const info = document.createElement("div");
    info.className = "row-info";
    const name = document.createElement("strong");
    name.textContent = invite.grupo_nome;
    const inviter = document.createElement("span");
    inviter.textContent = `Convite de ${invite.convidado_por}`;
    info.append(name, inviter);
    const accept = document.createElement("button");
    accept.type = "button";
    accept.className = "row-action";
    accept.textContent = "Aceitar";
    accept.addEventListener("click", async () => {
      try {
        await api(`/api/grupos/convites/${invite.convite_id}/aceitar`, { method: "POST" });
        await refreshLists();
      } catch (error) { accept.textContent = error.message; }
    });
    const decline = document.createElement("button");
    decline.type = "button";
    decline.className = "row-action decline-action";
    decline.textContent = "Recusar";
    decline.addEventListener("click", async () => {
      try {
        await api(`/api/grupos/convites/${invite.convite_id}/recusar`, { method: "POST" });
        await refreshLists();
      } catch (error) { decline.textContent = error.message; }
    });
    row.append(avatar, info, accept, decline);
    groupInvitesList.append(row);
  }
}

function renderPending(pending) {
  pendingList.replaceChildren();
  $("#requestCount").textContent = String(pending.length);
  for (const user of pending) {
    const row = makeRow(user, "Aceitar", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        await api("/api/amizades/aceitar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amizade_id: user.amizade_id }) });
        await refreshLists();
      } catch (error) { button.disabled = false; button.textContent = error.message; }
    });
    pendingList.append(row);
  }
}

async function openChat(friend) {
  stopChatPolling();
  clearPreview();
  appState.friend = friend;
  appState.group = null;
  appState.groupMembers = [];
  clearReplyTarget();
  hideMentionSuggestions();
  appState.maxId = 0;
  appScreen.classList.add("chat-open");
  $("#welcomePanel").classList.add("hidden");
  $("#conversation").classList.remove("hidden");
  $("#chatUsername").textContent = friend.username;
  $("#chatSubtitle").textContent = "Conversa privada";
  $("#inviteMembersButton").classList.add("hidden");
  setAvatar($("#chatAvatar"), friend);
  const activeContact = friendsList.querySelector(`[data-user-id="${friend.id}"] .unread-badge`);
  activeContact?.remove();
  messagesEl.replaceChildren();
  messageInput.value = "";
  await fetchMessages(true);
  if (appState.friend?.id !== friend.id || appState.group) return;
  appState.pollTimer = window.setInterval(() => fetchMessages(false), 2000);
  if (!window.matchMedia("(max-width: 760px)").matches) messageInput.focus();
  renderFriendsHighlight();
  renderGroupHighlight();
}

async function openGroupChat(group) {
  stopChatPolling();
  clearPreview();
  appState.friend = null;
  appState.group = group;
  appState.groupMembers = [];
  clearReplyTarget();
  appState.maxId = 0;
  appScreen.classList.add("chat-open");
  $("#welcomePanel").classList.add("hidden");
  $("#conversation").classList.remove("hidden");
  $("#chatUsername").textContent = group.nome;
  $("#chatSubtitle").textContent = "Grupo privado";
  $("#inviteMembersButton").classList.toggle("hidden", group.criador_id !== appState.me.id);
  setAvatar($("#chatAvatar"), { username: group.nome });
  $("#chatAvatar").classList.add("group-avatar");
  const mentionBadge = groupsList.querySelector(`[data-group-id="${group.id}"] .mention-badge`);
  mentionBadge?.remove();
  messagesEl.replaceChildren();
  messageInput.value = "";
  hideMentionSuggestions();
  try { appState.groupMembers = await api(`/api/grupos/${group.id}/membros`); }
  catch { appState.groupMembers = []; }
  if (appState.group?.id !== group.id) return;
  await fetchMessages(true);
  if (appState.group?.id !== group.id || appState.friend) return;
  appState.pollTimer = window.setInterval(() => fetchMessages(false), 2000);
  if (!window.matchMedia("(max-width: 760px)").matches) messageInput.focus();
  renderGroupHighlight();
  renderFriendsHighlight();
}

function renderFriendsHighlight() {
  for (const row of friendsList.querySelectorAll(".friend-row")) {
    row.classList.toggle("active", row.dataset.userId === String(appState.friend?.id || ""));
  }
}

function renderGroupHighlight() {
  for (const row of groupsList.querySelectorAll(".group-row")) {
    row.classList.toggle("active", row.dataset.groupId === String(appState.group?.id || ""));
  }
}

async function fetchMessages(initial) {
  const friend = appState.friend;
  const group = appState.group;
  if (!friend && !group) return;
  const endpoint = friend
    ? `/api/mensagens/${friend.id}?apos_id=${appState.maxId}`
    : `/api/grupos/${group.id}/mensagens?apos_id=${appState.maxId}`;
  const nearBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 110;
  try {
    const rows = await api(endpoint);
    if (friend ? appState.friend?.id !== friend.id : appState.group?.id !== group.id) return;
    for (const message of rows) {
      if (message.id <= appState.maxId) continue;
      appendMessage(message);
      appState.maxId = Math.max(appState.maxId, message.id);
    }
    if (!messagesEl.childElementCount && initial) {
      const empty = document.createElement("p");
      empty.className = "empty-chat";
      empty.textContent = "Esta conversa está começando. Envie a primeira mensagem.";
      messagesEl.append(empty);
    }
    if (rows.length && (initial || nearBottom)) messagesEl.scrollTop = messagesEl.scrollHeight;
  } catch (error) {
    // Falhas temporárias não interrompem as próximas tentativas do polling.
    if (appState.me && !error.message.includes("conectar")) console.warn("Polling da conversa:", error.message);
  }
}

function appendMessage(message) {
  const empty = messagesEl.querySelector(".empty-chat");
  if (empty) empty.remove();
  const row = document.createElement("div");
  const mine = message.remetente_id === appState.me.id;
  row.className = `message-row${mine ? " mine" : ""}`;
  row.dataset.messageId = String(message.id);
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  if (appState.group && !mine && message.remetente_username) {
    const sender = document.createElement("span");
    sender.className = "message-sender";
    sender.textContent = message.remetente_username;
    bubble.append(sender);
  }
  if (message.resposta) {
    const quote = document.createElement("button");
    quote.type = "button";
    quote.className = "quoted-message";
    const quoteSender = document.createElement("strong");
    quoteSender.textContent = message.resposta.username || "Mensagem";
    const quoteText = document.createElement("span");
    quoteText.textContent = message.resposta.tipo === "TEXTO" ? message.resposta.conteudo : (message.resposta.tipo === "IMAGEM" ? "Imagem" : "Vídeo");
    quote.append(quoteSender, quoteText);
    quote.addEventListener("click", () => messagesEl.querySelector(`[data-message-id="${message.resposta.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
    bubble.append(quote);
  }
  if (message.menciona_me) {
    const notice = document.createElement("span");
    notice.className = "mention-notice";
    notice.textContent = "@ Você foi mencionado";
    bubble.append(notice);
  }
  if (message.tipo === "TEXTO") {
    const text = document.createElement("div");
    text.className = "message-text";
    appendMentionText(text, message.conteudo || "");
    bubble.append(text);
  } else if (message.tipo === "IMAGEM") {
    const image = document.createElement("img");
    image.className = "message-media";
    image.src = message.conteudo;
    image.alt = "Imagem enviada";
    image.loading = "lazy";
    image.addEventListener("click", () => openImage(message.conteudo));
    bubble.append(image);
  } else if (message.tipo === "VIDEO") {
    const video = document.createElement("video");
    video.controls = true;
    video.preload = "metadata";
    video.src = message.conteudo;
    bubble.append(video);
  }
  const time = document.createElement("time");
  time.className = "message-time";
  const date = new Date(message.enviado_em);
  time.dateTime = message.enviado_em;
  time.textContent = Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  const footer = document.createElement("div");
  footer.className = "message-footer";
  footer.append(time);
  const reply = document.createElement("button");
  reply.type = "button";
  reply.className = "reply-action";
  reply.textContent = "Responder";
  reply.addEventListener("click", () => setReplyTarget(message));
  footer.append(reply);
  bubble.append(footer);
  row.append(bubble);
  messagesEl.append(row);
}

function appendMentionText(container, content) {
  const handles = appState.group ? appState.groupMembers.map((user) => `@${user.username}`).sort((a, b) => b.length - a.length) : [];
  let cursor = 0;
  while (cursor < content.length) {
    let found = null;
    for (const handle of handles) {
      const index = content.indexOf(handle, cursor);
      if (index < 0) continue;
      const before = index === 0 ? "" : content[index - 1];
      const after = content[index + handle.length] || "";
      if ((!before || !/[A-Za-z0-9_]/.test(before)) && (!after || !/[A-Za-z0-9_]/.test(after)) && (!found || index < found.index)) {
        found = { index, handle };
      }
    }
    if (!found) { container.append(document.createTextNode(content.slice(cursor))); break; }
    if (found.index > cursor) container.append(document.createTextNode(content.slice(cursor, found.index)));
    const tag = document.createElement("span");
    tag.className = "mention-tag";
    tag.textContent = found.handle;
    container.append(tag);
    cursor = found.index + found.handle.length;
  }
}

function setReplyTarget(message) {
  const preview = message.tipo === "TEXTO" ? message.conteudo : (message.tipo === "IMAGEM" ? "Imagem" : "Vídeo");
  appState.replyTarget = { id: message.id, username: message.remetente_username || (message.remetente_id === appState.me.id ? appState.me.username : appState.friend?.username), text: preview };
  const label = document.createElement("span");
  label.className = "reply-preview-copy";
  label.textContent = `Respondendo a ${appState.replyTarget.username}: ${preview}`;
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "reply-preview-close";
  cancel.textContent = "×";
  cancel.setAttribute("aria-label", "Cancelar resposta");
  cancel.addEventListener("click", clearReplyTarget);
  const target = $("#replyPreview");
  target.replaceChildren(label, cancel);
  target.classList.remove("hidden");
  hideMentionSuggestions();
  messageInput.focus();
}

function clearReplyTarget() {
  appState.replyTarget = null;
  const target = $("#replyPreview");
  if (target) { target.replaceChildren(); target.classList.add("hidden"); }
}

function openImage(src) {
  $("#modalImage").src = src;
  $("#imageModal").classList.remove("hidden");
  $("#closeImageModal").focus();
}

function closeImage() { $("#imageModal").classList.add("hidden"); $("#modalImage").removeAttribute("src"); }

function renderSearch(users) {
  searchResults.replaceChildren();
  if (!users.length) {
    const note = document.createElement("div");
    note.className = "empty-note";
    note.textContent = "Nenhum usuário encontrado.";
    searchResults.append(note);
    return;
  }
  for (const user of users) {
    const row = makeRow(user, "Adicionar", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        await api("/api/amizades/solicitar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ usuario_id: user.id }) });
        button.textContent = "Enviada";
      } catch (error) {
        button.disabled = false;
        if (error.message.toLowerCase().includes("solicitação") || error.message.includes("amizade")) {
          button.textContent = "Já solicitada";
        } else {
          button.textContent = error.message;
        }
      }
    });
    searchResults.append(row);
  }
}

function clearPreview() {
  if (appState.previewUrl) URL.revokeObjectURL(appState.previewUrl);
  appState.previewUrl = null;
  attachmentInput.value = "";
  attachmentPreview.replaceChildren();
  attachmentPreview.classList.add("hidden");
}

function prepareAttachment(file) {
  clearPreview();
  if (!file) return;
  if (file.size > MAX_UPLOAD) {
    attachmentInput.value = "";
    window.alert("O arquivo deve ter no máximo 50 MB.");
    return;
  }
  const ext = file.name.split(".").pop().toLowerCase();
  const image = ["png", "jpg", "jpeg", "gif", "webp"].includes(ext);
  const video = ["mp4", "webm", "mov"].includes(ext);
  if (!image && !video) {
    attachmentInput.value = "";
    window.alert("Escolha uma imagem PNG, JPG, GIF, WebP ou vídeo MP4, WebM, MOV.");
    return;
  }
  appState.previewUrl = URL.createObjectURL(file);
  const media = image ? document.createElement("img") : document.createElement("video");
  media.className = "preview-media";
  media.src = appState.previewUrl;
  if (video) media.muted = true;
  const details = document.createElement("div");
  details.className = "preview-details";
  const name = document.createElement("strong");
  name.textContent = file.name;
  const size = document.createElement("span");
  size.textContent = `${(file.size / (1024 * 1024)).toFixed(1)} MB · Pronto para enviar`;
  details.append(name, size);
  const actions = document.createElement("div");
  actions.className = "preview-actions";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "button button-quiet";
  cancel.textContent = "Cancelar";
  cancel.addEventListener("click", clearPreview);
  const send = document.createElement("button");
  send.type = "button";
  send.className = "button button-primary";
  send.textContent = "Enviar";
  send.addEventListener("click", () => sendAttachment(file, send, size));
  actions.append(cancel, send);
  attachmentPreview.append(media, details, actions);
  attachmentPreview.classList.remove("hidden");
}

async function sendAttachment(file, button, status) {
  if ((!appState.friend && !appState.group) || appState.busy) return;
  appState.busy = true;
  button.disabled = true;
  status.textContent = "Enviando…";
  const body = new FormData();
  const endpoint = appState.friend ? "/api/mensagens" : `/api/grupos/${appState.group.id}/mensagens`;
  if (appState.friend) body.append("destinatario_id", String(appState.friend.id));
  if (appState.replyTarget) body.append("resposta_id", String(appState.replyTarget.id));
  body.append("arquivo", file);
  try {
    await api(endpoint, { method: "POST", body });
    clearReplyTarget();
    clearPreview();
    await fetchMessages(false);
  } catch (error) { status.textContent = error.message; button.disabled = false; }
  finally { appState.busy = false; }
}

function insertEmoji(emoji) {
  const start = messageInput.selectionStart;
  const end = messageInput.selectionEnd;
  messageInput.setRangeText(emoji, start, end, "end");
  messageInput.focus();
  messageInput.dispatchEvent(new Event("input", { bubbles: true }));
}

function autoSizeInput() {
  messageInput.style.height = "auto";
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 140)}px`;
}

function mentionedMemberIds(text) {
  if (!appState.group) return [];
  const tokens = new Set(text.split(/\s+/));
  return appState.groupMembers
    .filter((member) => member.id !== appState.me.id && tokens.has(`@${member.username}`))
    .map((member) => member.id);
}

function hideMentionSuggestions() {
  const menu = $("#mentionSuggestions");
  menu.replaceChildren();
  menu.classList.add("hidden");
}

function updateMentionSuggestions() {
  const prefix = messageInput.value.slice(0, messageInput.selectionStart);
  const match = prefix.match(/(?:^|\s)@([^\s]*)$/);
  if (!appState.group || !match) { hideMentionSuggestions(); return; }
  const query = match[1].toLowerCase();
  const candidates = appState.groupMembers.filter((member) => member.id !== appState.me.id && member.username.toLowerCase().includes(query));
  const menu = $("#mentionSuggestions");
  menu.replaceChildren();
  for (const member of candidates.slice(0, 8)) {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "mention-option";
    option.setAttribute("role", "option");
    const name = document.createElement("strong");
    name.textContent = member.nome_completo || member.username;
    const username = document.createElement("span");
    username.textContent = `@${member.username}`;
    option.append(name, username);
    option.addEventListener("mousedown", (event) => event.preventDefault());
    option.addEventListener("click", () => {
      const start = messageInput.selectionStart - match[1].length - 1;
      const end = messageInput.selectionStart;
      messageInput.setRangeText(`@${member.username} `, start, end, "end");
      hideMentionSuggestions();
      autoSizeInput();
      messageInput.focus();
    });
    menu.append(option);
  }
  menu.classList.toggle("hidden", !candidates.length);
}

$("#loginTab").addEventListener("click", () => setAuthMode(false));
$("#registerTab").addEventListener("click", () => setAuthMode(true));
function setAuthMode(register) {
  authForm.dataset.register = String(register);
  $("#loginTab").classList.toggle("active", !register);
  $("#registerTab").classList.toggle("active", register);
  $("#loginTab").setAttribute("aria-selected", String(!register));
  $("#registerTab").setAttribute("aria-selected", String(register));
  $("#registerFields").classList.toggle("hidden", !register);
  $("#registerFields").disabled = !register;
  $("#registerPhotoField").classList.toggle("hidden", !register);
  $("#passwordMeter").classList.toggle("hidden", !register);
  authPassword.autocomplete = register ? "new-password" : "current-password";
  authPassword.minLength = register ? 10 : 1;
  $("#usernameHint").classList.toggle("hidden", !register);
  $("#authSubmit").textContent = register ? "Criar conta" : "Entrar";
  showError(authError, "");
  updatePasswordMeter();
}

function updatePasswordMeter() {
  const meter = $("#passwordMeter");
  const password = authPassword.value;
  const checks = [
    password.length >= 10,
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  const score = checks.filter(Boolean).length;
  meter.dataset.strength = String(score);
  const labels = ["Muito fraca", "Fraca", "Razoável", "Boa", "Quase forte", "Forte"];
  $("#passwordStrengthText").textContent = password ? labels[score] : "Use 10+ caracteres, maiúscula, minúscula, número e símbolo.";
}

authUsername.addEventListener("input", () => {
  const start = authUsername.selectionStart;
  const original = authUsername.value;
  authUsername.value = original.toLowerCase();
  if (start !== null) authUsername.setSelectionRange(start, start);
});

authPassword.addEventListener("input", updatePasswordMeter);
$("#togglePassword").addEventListener("click", () => {
  const showing = authPassword.type === "text";
  authPassword.type = showing ? "password" : "text";
  $("#togglePassword").textContent = showing ? "Mostrar" : "Ocultar";
  $("#togglePassword").setAttribute("aria-label", showing ? "Mostrar senha" : "Ocultar senha");
  $("#togglePassword").setAttribute("aria-pressed", String(!showing));
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError(authError, "");
  const register = authForm.dataset.register === "true";
  const button = $("#authSubmit");
  button.disabled = true;
  try {
    let user;
    if (register) {
      const body = new FormData();
      body.append("username", authUsername.value.trim());
      body.append("nome_completo", fullNameInput.value.trim());
      body.append("data_nascimento", birthDateInput.value);
      body.append("sexo", sexInput.value);
      body.append("email", registerEmailInput.value.trim());
      body.append("senha", authPassword.value);
      if (registerPhoto.files[0]) body.append("foto", registerPhoto.files[0]);
      user = await api("/api/cadastro", { method: "POST", body });
    } else {
      user = await api("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: authUsername.value.trim(), senha: authPassword.value }) });
    }
    authForm.reset();
    setAvatar($("#registerPreview"), null, true);
    showApp(user);
  } catch (error) { showError(authError, error.message); }
  finally { button.disabled = false; }
});

registerPhoto.addEventListener("change", () => {
  const file = registerPhoto.files[0];
  if (!file) return;
  if (appState.registerPreviewUrl) URL.revokeObjectURL(appState.registerPreviewUrl);
  appState.registerPreviewUrl = URL.createObjectURL(file);
  const preview = $("#registerPreview");
  preview.replaceChildren();
  const img = document.createElement("img");
  img.src = appState.registerPreviewUrl;
  img.alt = "Prévia da foto de perfil";
  preview.append(img);
});

profilePhoto.addEventListener("change", async () => {
  const file = profilePhoto.files[0];
  if (!file) return;
  const body = new FormData();
  body.append("foto", file);
  try {
    const result = await api("/api/perfil/foto", { method: "POST", body });
    appState.me.foto = result.foto;
    setAvatar($("#myAvatar"), appState.me);
  } catch (error) { window.alert(error.message); }
  finally { profilePhoto.value = ""; }
});

$("#editProfileButton").addEventListener("click", async () => {
  showError($("#profileEditError"), "");
  $("#currentPassword").value = "";
  $("#newPassword").value = "";
  try {
    const profile = await api("/api/perfil/dados");
    $("#editFullName").value = profile.nome_completo;
    $("#editBirthDate").value = profile.data_nascimento;
    $("#editSex").value = profile.sexo;
    $("#editUsername").value = profile.username;
    $("#editEmail").value = profile.email || "";
    $("#profileModal").classList.remove("hidden");
    $("#editFullName").focus();
  } catch (error) { window.alert(error.message); }
});

$("#editUsername").addEventListener("input", () => {
  const cursor = $("#editUsername").selectionStart;
  $("#editUsername").value = $("#editUsername").value.toLowerCase();
  if (cursor !== null) $("#editUsername").setSelectionRange(cursor, cursor);
});

$("#profileEditForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button[type='submit']");
  button.disabled = true;
  showError($("#profileEditError"), "");
  try {
    const result = await api("/api/perfil/atualizar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome_completo: $("#editFullName").value.trim(),
        data_nascimento: $("#editBirthDate").value,
        sexo: $("#editSex").value,
        username: $("#editUsername").value.trim(),
        email: $("#editEmail").value.trim(),
        senha_atual: $("#currentPassword").value,
        nova_senha: $("#newPassword").value,
      }),
    });
    appState.me.username = result.username;
    appState.me.email = result.email;
    appState.me.nome_completo = result.nome_completo;
    $("#myUsername").textContent = result.username;
    appScreen.inert = false;
    $("#emailGate").classList.add("hidden");
    $("#profileModal").classList.add("hidden");
  } catch (error) { showError($("#profileEditError"), error.message); }
  finally { button.disabled = false; }
});

$("#emailNotice").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button[type='submit']");
  button.disabled = true;
  showError($("#emailNoticeError"), "");
  try {
    const result = await api("/api/perfil/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: $("#accountEmail").value.trim() }),
    });
    appState.me.email = result.email;
    appScreen.inert = false;
    $("#emailGate").classList.add("hidden");
    $("#accountEmail").value = "";
    await refreshLists();
    stopListPolling();
    appState.listsTimer = window.setInterval(refreshLists, 10000);
  } catch (error) { showError($("#emailNoticeError"), error.message); }
  finally { button.disabled = false; }
});

$("#emailGateLogout").addEventListener("click", async () => {
  try { await api("/api/logout", { method: "POST" }); } catch { /* encerra localmente */ }
  showAuth();
});

$("#logoutButton").addEventListener("click", async () => {
  try { await api("/api/logout", { method: "POST" }); } catch { /* a tela também encerra localmente */ }
  clearPreview();
  showAuth();
});

searchInput.addEventListener("input", () => {
  window.clearTimeout(appState.searchTimer);
  const q = searchInput.value.trim();
  searchResults.replaceChildren();
  if (q.length < 2) return;
  appState.searchTimer = window.setTimeout(async () => {
    try { renderSearch(await api(`/api/usuarios/buscar?q=${encodeURIComponent(q)}`)); }
    catch (error) { if (appState.me) { const note = document.createElement("div"); note.className = "empty-note"; note.textContent = error.message; searchResults.replaceChildren(note); } }
  }, 400);
});

$("#refreshButton").addEventListener("click", refreshLists);
$("#findPeopleButton").addEventListener("click", () => { searchInput.focus(); searchInput.scrollIntoView({ behavior: "smooth", block: "center" }); });
$("#backButton").addEventListener("click", () => { stopChatPolling(); clearPreview(); clearReplyTarget(); hideMentionSuggestions(); appState.friend = null; appState.group = null; appState.groupMembers = []; appScreen.classList.remove("chat-open"); $("#conversation").classList.add("hidden"); $("#welcomePanel").classList.remove("hidden"); renderFriendsHighlight(); renderGroupHighlight(); });

$("#createGroupButton").addEventListener("click", () => {
  $("#createGroupForm").reset();
  showError($("#createGroupError"), "");
  $("#createGroupModal").classList.remove("hidden");
  $("#groupNameInput").focus();
});

$("#createGroupForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button[type='submit']");
  button.disabled = true;
  try {
    const group = await api("/api/grupos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: $("#groupNameInput").value.trim() }),
    });
    $("#createGroupModal").classList.add("hidden");
    await refreshLists();
    await openGroupChat(group);
  } catch (error) { showError($("#createGroupError"), error.message); }
  finally { button.disabled = false; }
});

$("#inviteMembersButton").addEventListener("click", async () => {
  const group = appState.group;
  if (!group || group.criador_id !== appState.me.id) return;
  appState.inviteGroupId = group.id;
  showError($("#inviteGroupError"), "");
  const list = $("#inviteFriendsList");
  list.replaceChildren();
  $("#inviteGroupTitle").textContent = `Convidar para ${group.nome}`;
  try {
    const members = await api(`/api/grupos/${group.id}/membros`);
    const memberIds = new Set(members.map((member) => member.id));
    const available = appState.friends.filter((friend) => !memberIds.has(friend.id));
    if (!available.length) {
      const note = document.createElement("p");
      note.className = "empty-note";
      note.textContent = appState.friends.length
        ? "Todos os seus amigos já participam deste grupo."
        : "Adicione amigos antes de convidá-los para o grupo.";
      list.append(note);
      $("#sendGroupInvitesButton").disabled = true;
    } else {
      $("#sendGroupInvitesButton").disabled = false;
      for (const friend of available) {
        const label = document.createElement("label");
        label.className = "invite-check-row";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = String(friend.id);
        const avatar = document.createElement("div");
        avatar.className = "avatar";
        setAvatar(avatar, friend);
        const name = document.createElement("span");
        name.textContent = friend.username;
        label.append(checkbox, avatar, name);
        list.append(label);
      }
    }
    $("#inviteGroupModal").classList.remove("hidden");
  } catch (error) { showError($("#inviteGroupError"), error.message); }
});

$("#sendGroupInvitesButton").addEventListener("click", async () => {
  const groupId = appState.inviteGroupId;
  const ids = [...$("#inviteFriendsList").querySelectorAll("input:checked")].map((input) => Number(input.value));
  if (!groupId || !ids.length) {
    showError($("#inviteGroupError"), "Selecione pelo menos um amigo.");
    return;
  }
  const button = $("#sendGroupInvitesButton");
  button.disabled = true;
  const failures = [];
  for (const id of ids) {
    try {
      await api(`/api/grupos/${groupId}/convites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario_id: id }),
      });
    } catch (error) { failures.push(error.message); }
  }
  button.disabled = false;
  if (failures.length) {
    showError($("#inviteGroupError"), failures.join(" "));
  } else {
    $("#inviteGroupModal").classList.add("hidden");
    await refreshLists();
  }
});

$("#closeProfileModal").addEventListener("click", () => $("#profileModal").classList.add("hidden"));
$("#closeCreateGroupModal").addEventListener("click", () => $("#createGroupModal").classList.add("hidden"));
$("#closeInviteGroupModal").addEventListener("click", () => $("#inviteGroupModal").classList.add("hidden"));
for (const modal of [$("#profileModal"), $("#createGroupModal"), $("#inviteGroupModal")]) {
  modal.addEventListener("click", (event) => { if (event.target === modal) modal.classList.add("hidden"); });
}

$("#composer").addEventListener("submit", async (event) => {
  event.preventDefault();
  const texto = messageInput.value.trim();
  if (!texto || (!appState.friend && !appState.group) || appState.busy) return;
  appState.busy = true;
  $("#sendButton").disabled = true;
  try {
    const endpoint = appState.friend ? "/api/mensagens" : `/api/grupos/${appState.group.id}/mensagens`;
    const payload = appState.friend
      ? { destinatario_id: appState.friend.id, texto, resposta_id: appState.replyTarget?.id || null }
      : { texto, resposta_id: appState.replyTarget?.id || null, mencoes: mentionedMemberIds(texto) };
    await api(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    messageInput.value = "";
    clearReplyTarget();
    hideMentionSuggestions();
    autoSizeInput();
    await fetchMessages(false);
  } catch (error) { window.alert(error.message); }
  finally { appState.busy = false; $("#sendButton").disabled = false; messageInput.focus(); }
});

messageInput.addEventListener("input", () => { autoSizeInput(); updateMentionSuggestions(); });
messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !$("#mentionSuggestions").classList.contains("hidden")) {
    const first = $("#mentionSuggestions").querySelector("button");
    if (first) { event.preventDefault(); first.click(); return; }
  }
  if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); $("#composer").requestSubmit(); }
});
$("#attachButton").addEventListener("click", () => attachmentInput.click());
attachmentInput.addEventListener("change", () => prepareAttachment(attachmentInput.files[0]));

for (const emoji of EMOJIS) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "emoji-choice";
  button.setAttribute("role", "gridcell");
  button.textContent = emoji;
  button.setAttribute("aria-label", `Inserir ${emoji}`);
  button.addEventListener("click", () => insertEmoji(emoji));
  emojiPicker.append(button);
}
$("#emojiButton").addEventListener("click", () => {
  const open = emojiPicker.classList.toggle("hidden") === false;
  $("#emojiButton").setAttribute("aria-expanded", String(open));
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".emoji-wrap")) { emojiPicker.classList.add("hidden"); $("#emojiButton").setAttribute("aria-expanded", "false"); }
});

$("#closeImageModal").addEventListener("click", closeImage);
$("#imageModal").addEventListener("click", (event) => { if (event.target.id === "imageModal") closeImage(); });
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeImage();
    emojiPicker.classList.add("hidden");
    $("#profileModal").classList.add("hidden");
    $("#createGroupModal").classList.add("hidden");
    $("#inviteGroupModal").classList.add("hidden");
  }
});

setAuthMode(false);

// Recupera a sessão existente ao abrir a aplicação.
(async function init() {
  try { showApp(await api("/api/eu")); }
  catch { /* a tela de login já está visível */ }
})();
