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
const appState = { me: null, friend: null, group: null, groups: [], groupMembers: [], friends: [], inviteGroupId: null, replyTarget: null, deleteTarget: null, adminEditingUser: null, maxId: 0, pollTimer: null, listsTimer: null, presenceTimer: null, searchTimer: null, adminSearchTimer: null, previewUrl: null, busy: false, activeView: "home", feedTab: "following", profileReturnView: "home", profileReturnUserId: null, viewedProfile: null, profilePostsBefore: null, profilePostsLoading: false, feedBeforeId: null, feedHasMore: false, feedLoading: false };
const MAX_UPLOAD = 50 * 1024 * 1024;
let selectedPostFile = null;
let postPreviewUrl = null;
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
  if (appState.presenceTimer) window.clearInterval(appState.presenceTimer);
  appState.presenceTimer = null;
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

async function sendPresencePing() {
  if (!appState.me || document.visibilityState === "hidden") return;
  try { await api("/api/presenca", { method: "POST" }); } catch { /* a presença volta no próximo ping */ }
}

function startPresence() {
  if (appState.presenceTimer) window.clearInterval(appState.presenceTimer);
  sendPresencePing();
  appState.presenceTimer = window.setInterval(sendPresencePing, 25000);
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") sendPresencePing();
});

async function showApp(user) {
  appState.me = user;
  authScreen.classList.add("hidden");
  appScreen.classList.remove("hidden");
  const hasEmail = Boolean(user.email);
  appScreen.inert = !hasEmail;
  $("#emailGate").classList.toggle("hidden", hasEmail);
  $("#myUsername").textContent = user.username;
  setAvatar($("#myAvatar"), user);
  if ($("#feedComposerAvatar")) setAvatar($("#feedComposerAvatar"), user);
  if ($("#profileAvatar")) setAvatar($("#profileAvatar"), user, true);
  $("#profileDisplayName").textContent = user.nome_completo || user.username;
  $("#profileHandle").textContent = `@${user.username}`;
  $("#profileBio").textContent = user.bio || "";
  $("#navAdmin").classList.toggle("hidden", !user.is_admin);
  stopListPolling();
  if (hasEmail) {
    startPresence();
    await refreshLists();
    await loadFeed(true);
    showMainView("home");
    appState.listsTimer = window.setInterval(refreshLists, 10000);
    await updateNotificationsButton();
    const params = new URLSearchParams(window.location.search);
    const groupId = Number(params.get("grupo"));
    const contactId = Number(params.get("contato"));
    if (groupId) {
      const group = appState.groups.find((item) => item.id === groupId);
      if (group) await openGroupChat(group);
    } else if (contactId) {
      const friend = appState.friends.find((item) => item.id === contactId);
      if (friend) await openChat(friend);
    }
    if (groupId || contactId) window.history.replaceState({}, "", window.location.pathname);
    else if (params.get("aba") === "notificacoes") {
      showMainView("notifications");
      await loadSocialNotifications();
    }
  } else {
    window.setTimeout(() => $("#accountEmail").focus(), 0);
  }
}

function showMainView(view) {
  appState.activeView = view;
  const isChat = view === "chat";
  $("#homeView").classList.toggle("hidden", view !== "home");
  $("#profileView").classList.toggle("hidden", view !== "profile");
  $("#notificationsView").classList.toggle("hidden", view !== "notifications");
  $("#adminView").classList.toggle("hidden", view !== "admin");
  $("#conversation").classList.toggle("hidden", !isChat);
  $("#welcomePanel").classList.toggle("hidden", view !== "conversations");
  document.querySelectorAll("#sidebar .sidebar-section, #sidebar .sidebar-foot").forEach((element) => {
    element.classList.toggle("hidden", view !== "conversations" && !isChat);
  });
  appScreen.classList.toggle("chat-open", isChat);
  appScreen.classList.toggle("show-conversations", view === "conversations" || isChat);
  $("#navHome").classList.toggle("active", view === "home");
  $("#navConversations").classList.toggle("active", view === "conversations" || isChat);
  $("#navNotifications").classList.toggle("active", view === "notifications");
  $("#navAdmin").classList.toggle("active", view === "admin");
  $("#navProfile").classList.toggle("active", view === "profile");
}

function linkToProfile(element, userId) {
  if (!userId) return;
  element.classList.add("profile-clickable");
  element.setAttribute("role", "button");
  element.tabIndex = 0;
  element.title = "Ver perfil";
  element.addEventListener("click", (event) => {
    event.stopPropagation();
    openUserProfile(userId);
  });
  element.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      openUserProfile(userId);
    }
  });
}

async function openUserProfile(userId, returnView = appState.activeView) {
  if (!userId) return;
  appState.profileReturnUserId = returnView === "profile" ? appState.viewedProfile?.id : null;
  appState.profileReturnView = returnView;
  showMainView("profile");
  await loadProfileView(userId);
}

async function loadProfileView(userId = appState.me.id) {
  try {
    const profile = await api(`/api/usuarios/${userId}/perfil`);
    if (appState.activeView !== "profile") return;
    appState.viewedProfile = profile;
    appState.profilePostsLoading = false;
    setAvatar($("#profileAvatar"), { username: profile.username, foto: profile.foto }, true);
    $("#profileDisplayName").textContent = profile.nome_completo || profile.username;
    $("#profileVerified").classList.toggle("hidden", !profile.verificado);
    $("#profileHandle").textContent = `@${profile.username}`;
    $("#profilePresence").textContent = profile.meu_perfil ? "" : profile.online ? "Online" : "Offline";
    $("#profilePresence").classList.toggle("is-online", Boolean(profile.online));
    $("#profileAge").textContent = Number.isInteger(profile.idade) ? `${profile.idade} anos` : "";
    $("#profileBio").textContent = profile.bio || (profile.meu_perfil ? "Adicione uma biografia para contar um pouco sobre você." : "");
    $("#profilePageTitle").textContent = profile.meu_perfil ? "MEU PERFIL" : "PERFIL";
    $("#profilePhotoAction").classList.toggle("hidden", !profile.meu_perfil);
    $("#profileEditLink").classList.toggle("hidden", !profile.meu_perfil);
    $("#profileLogoutButton").classList.toggle("hidden", !profile.meu_perfil);
    const followButton = $("#followProfileButton");
    followButton.classList.toggle("hidden", profile.meu_perfil);
    followButton.textContent = profile.seguindo_por_mim ? "Seguindo" : "Seguir";
    followButton.classList.toggle("button-quiet", profile.seguindo_por_mim);
    followButton.classList.toggle("button-primary", !profile.seguindo_por_mim);
    const stats = $("#profileSocialStats");
    stats.replaceChildren();
    for (const [count, label, relation] of [[profile.seguidores, "seguidores", "seguidores"], [profile.seguindo, "seguindo", "seguindo"]]) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "profile-stat-button";
      const strong = document.createElement("strong");
      strong.textContent = String(count);
      item.append(strong, document.createTextNode(` ${label}`));
      item.addEventListener("click", () => openRelationsList(profile.id, relation));
      stats.append(item);
    }

    const details = $("#profileDetails");
    details.replaceChildren();
    details.classList.toggle("hidden", !profile.meu_perfil);
    if (profile.meu_perfil) {
      const privateData = await api("/api/perfil/dados");
      if (appState.activeView !== "profile" || appState.viewedProfile?.id !== profile.id) return;
      for (const [label, value] of [["E-mail", privateData.email || "Não informado"], ["Sexo", privateData.sexo || "—"]]) {
        const term = document.createElement("dt");
        term.textContent = label;
        const detail = document.createElement("dd");
        detail.textContent = value;
        details.append(term, detail);
      }
    }

    const posts = $("#profilePosts");
    posts.replaceChildren();
    $("#loadMoreProfilePostsButton").classList.add("hidden");
    appState.profilePostsBefore = null;
    const canSeePosts = profile.meu_perfil || profile.seguindo_por_mim || appState.friends.some((friend) => friend.id === profile.id);
    if (!canSeePosts) {
      const note = document.createElement("p");
      note.className = "feed-empty";
      note.textContent = "As publicações aparecem para quem segue esta conta.";
      posts.append(note);
      return;
    }
    await loadProfilePosts(profile.id, true);
  } catch (error) { window.alert(error.message); }
}

async function openRelationsList(userId, relation) {
  const title = relation === "seguidores" ? "Seguidores" : "Seguindo";
  $("#relationsTitle").textContent = title;
  const list = $("#relationsList");
  list.replaceChildren();
  $("#relationsModal").classList.remove("hidden");
  try {
    const users = await api(`/api/usuarios/${userId}/${relation}`);
    if (!users.length) {
      const empty = document.createElement("p");
      empty.className = "empty-note";
      empty.textContent = relation === "seguidores" ? "Ainda não há seguidores." : "Esta conta ainda não segue ninguém.";
      list.append(empty);
      return;
    }
    for (const user of users) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "list-row profile-relation-row";
      const avatar = document.createElement("div");
      avatar.className = "avatar";
      setAvatar(avatar, user);
      const name = document.createElement("span");
      name.textContent = user.nome_completo || user.username;
      row.append(avatar, name);
      row.addEventListener("click", () => {
        $("#relationsModal").classList.add("hidden");
        openUserProfile(user.id);
      });
      list.append(row);
    }
  } catch (error) {
    const note = document.createElement("p");
    note.className = "empty-note";
    note.textContent = error.message;
    list.append(note);
  }
}

async function loadProfilePosts(userId, reset = false) {
  if (appState.profilePostsLoading) return;
  appState.profilePostsLoading = true;
  const posts = $("#profilePosts");
  const more = $("#loadMoreProfilePostsButton");
  if (reset) {
    posts.replaceChildren();
    appState.profilePostsBefore = null;
  }
  try {
    const before = reset || !appState.profilePostsBefore ? "" : `&antes_id=${appState.profilePostsBefore}`;
    const rows = await api(`/api/feed?usuario_id=${userId}${before}`);
    if (appState.activeView !== "profile" || appState.viewedProfile?.id !== userId) return;
    if (!rows.length && !posts.childElementCount) {
      const note = document.createElement("p");
      note.className = "feed-empty";
      note.textContent = "Ainda não há publicações.";
      posts.append(note);
    } else {
      posts.querySelector(".feed-empty")?.remove();
      for (const post of rows) appendFeedPost(post, posts);
    }
    if (rows.length) appState.profilePostsBefore = rows[rows.length - 1].id;
    more.classList.toggle("hidden", rows.length < 25);
  } catch (error) { window.alert(error.message); }
  finally { appState.profilePostsLoading = false; }
}

function feedTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "agora";
  const elapsed = Math.max(0, Date.now() - date.getTime());
  if (elapsed < 60000) return "agora";
  if (elapsed < 3600000) return `${Math.floor(elapsed / 60000)} min`;
  if (elapsed < 86400000) return `${Math.floor(elapsed / 3600000)} h`;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

async function loadFeed(reset = false) {
  if (appState.feedLoading) return;
  appState.feedLoading = true;
  const button = $("#loadMorePostsButton");
  if (reset) {
    $("#feedPosts").replaceChildren();
    appState.feedBeforeId = null;
  }
  try {
    const url = reset || !appState.feedBeforeId ? "/api/feed" : `/api/feed?antes_id=${appState.feedBeforeId}`;
    const posts = await api(url);
    const list = $("#feedPosts");
    if (!posts.length && !list.childElementCount) {
      const empty = document.createElement("p");
      empty.className = "feed-empty";
      empty.textContent = "Ainda não há publicações. Siga pessoas ou compartilhe a primeira.";
      list.append(empty);
    } else {
      list.querySelector(".feed-empty")?.remove();
      for (const post of posts) appendFeedPost(post);
    }
    if (posts.length) appState.feedBeforeId = posts[posts.length - 1].id;
    appState.feedHasMore = posts.length === 25;
    button.classList.toggle("hidden", !appState.feedHasMore);
  } catch (error) {
    if (reset) {
      const note = document.createElement("p");
      note.className = "feed-empty";
      note.textContent = error.message;
      $("#feedPosts").replaceChildren(note);
    }
  } finally { appState.feedLoading = false; }
}

function appendFeedPost(post, list = $("#feedPosts")) {
  if (list.querySelector(`[data-post-id="${post.id}"]`)) return;
  list.querySelector(".feed-empty")?.remove();
  const card = document.createElement("article");
  card.className = "feed-post";
  card.dataset.postId = String(post.id);
  const header = document.createElement("header");
  header.className = "feed-post-header";
  const avatar = document.createElement("div");
  avatar.className = "avatar";
  setAvatar(avatar, { username: post.autor_username, foto: post.autor_foto });
  linkToProfile(avatar, post.usuario_id);
  const author = document.createElement("div");
  author.className = "feed-post-author";
  const name = document.createElement("strong");
  name.textContent = post.autor_nome || post.autor_username;
  linkToProfile(name, post.usuario_id);
  const meta = document.createElement("span");
  meta.textContent = `@${post.autor_username} · ${feedTime(post.criado_em)}`;
  author.append(name, meta);
  header.append(avatar, author);
  const content = document.createElement("div");
  content.className = "feed-post-content";
  if (post.texto) {
    const text = document.createElement("p");
    text.textContent = post.texto;
    content.append(text);
  }
  if (post.midia_url && post.tipo === "IMAGEM") {
    const image = document.createElement("img");
    image.className = "feed-post-media";
    image.src = post.midia_url;
    image.alt = "Imagem da publicação";
    image.loading = "lazy";
    image.addEventListener("click", () => openImage(post.midia_url));
    content.append(image);
  } else if (post.midia_url && post.tipo === "VIDEO") {
    const video = document.createElement("video");
    video.className = "feed-post-media";
    video.controls = true;
    video.preload = "metadata";
    video.src = post.midia_url;
    content.append(video);
  }
  const actions = document.createElement("div");
  actions.className = "feed-post-actions";
  const like = document.createElement("button");
  like.type = "button";
  like.className = `feed-action like-action${post.curtido_por_mim ? " liked" : ""}`;
  like.textContent = `${post.curtido_por_mim ? "♥ Curtido" : "♡ Curtir"} · ${post.curtidas}`;
  like.addEventListener("click", async () => {
    like.disabled = true;
    try {
      const result = await api(`/api/feed/posts/${post.id}/curtir`, { method: "POST" });
      post.curtido_por_mim = result.curtido;
      post.curtidas = result.curtidas;
      like.classList.toggle("liked", result.curtido);
      like.textContent = `${result.curtido ? "♥ Curtido" : "♡ Curtir"} · ${result.curtidas}`;
    } catch (error) { window.alert(error.message); }
    finally { like.disabled = false; }
  });
  const commentsToggle = document.createElement("button");
  commentsToggle.type = "button";
  commentsToggle.className = "feed-action";
  commentsToggle.textContent = `▢ Comentários · ${post.comentarios}`;
  const comments = document.createElement("section");
  comments.className = "feed-comments hidden";
  commentsToggle.addEventListener("click", async () => {
    const opening = comments.classList.contains("hidden");
    comments.classList.toggle("hidden", !opening);
    if (opening && !comments.dataset.loaded) await loadPostComments(post, comments, commentsToggle);
  });
  actions.append(like, commentsToggle);
  card.append(header, content, actions, comments);
  list.append(card);
}

async function loadPostComments(post, container, toggle) {
  try {
    const comments = await api(`/api/feed/posts/${post.id}/comentarios`);
    container.replaceChildren();
    const list = document.createElement("div");
    list.className = "feed-comment-list";
    let replyTarget = null;
    const replyPreview = document.createElement("div");
    replyPreview.className = "comment-reply-preview hidden";
    const replyCopy = document.createElement("span");
    const cancelReply = document.createElement("button");
    cancelReply.type = "button";
    cancelReply.className = "text-button";
    cancelReply.textContent = "Cancelar";
    cancelReply.addEventListener("click", () => { replyTarget = null; replyPreview.classList.add("hidden"); });
    replyPreview.append(replyCopy, cancelReply);
    for (const comment of comments) {
      const item = document.createElement("div");
      item.className = "feed-comment";
      const avatar = document.createElement("div");
      avatar.className = "avatar comment-avatar";
      setAvatar(avatar, { username: comment.username, foto: comment.foto });
      linkToProfile(avatar, comment.usuario_id);
      const body = document.createElement("div");
      body.className = "feed-comment-body";
      const byline = document.createElement("strong");
      byline.textContent = comment.nome_completo || comment.username;
      linkToProfile(byline, comment.usuario_id);
      const text = document.createElement("p");
      text.textContent = comment.texto;
      body.append(byline);
      if (comment.resposta) {
        const quoted = document.createElement("p");
        quoted.className = "comment-quoted-reply";
        quoted.textContent = `Respondendo a @${comment.resposta.username}: ${comment.resposta.texto}`;
        body.append(quoted);
      }
      body.append(text);
      const reply = document.createElement("button");
      reply.type = "button";
      reply.className = "feed-comment-reply";
      reply.textContent = "Responder";
      reply.addEventListener("click", () => {
        replyTarget = comment;
        replyCopy.textContent = `Respondendo a ${comment.nome_completo || comment.username}: ${comment.texto}`;
        replyPreview.classList.remove("hidden");
      });
      item.append(avatar, body, reply);
      list.append(item);
    }
    if (!comments.length) {
      const empty = document.createElement("p");
      empty.className = "empty-note";
      empty.textContent = "Seja a primeira pessoa a comentar.";
      list.append(empty);
    }
    const form = document.createElement("form");
    form.className = "feed-comment-form";
    const input = document.createElement("input");
    input.type = "text";
    input.maxLength = 1500;
    input.placeholder = "Escreva um comentário...";
    input.required = true;
    const send = document.createElement("button");
    send.type = "submit";
    send.className = "button button-quiet";
    send.textContent = "Enviar";
    form.append(replyPreview, input, send);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      send.disabled = true;
      try {
        await api(`/api/feed/posts/${post.id}/comentarios`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto: input.value.trim(), resposta_id: replyTarget?.id || null }) });
        post.comentarios += 1;
        toggle.textContent = `▢ Comentários · ${post.comentarios}`;
        replyTarget = null;
        replyPreview.classList.add("hidden");
        container.dataset.loaded = "";
        await loadPostComments(post, container, toggle);
      } catch (error) { window.alert(error.message); }
      finally { send.disabled = false; }
    });
    container.append(list, form);
    container.dataset.loaded = "true";
  } catch (error) {
    container.textContent = error.message;
  }
}

function base64UrlToBytes(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

async function updateNotificationsButton() {
  const button = $("#notificationsButton");
  const status = $("#notificationsStatus");
  if (!button || !status) return;
  button.disabled = true;
  if (!appState.me?.email) {
    $("#pushSettings").classList.add("hidden");
    status.textContent = "";
    return;
  }
  $("#pushSettings").classList.remove("hidden");
  if (!window.isSecureContext || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    button.setAttribute("aria-checked", "false");
    button.classList.remove("is-on");
    status.textContent = "Use o Simple Chat em HTTPS para ativar avisos.";
    button.disabled = false;
    return;
  }
  try {
    const registration = await navigator.serviceWorker.register("/service-worker.js");
    const subscription = await registration.pushManager.getSubscription();
    const active = Boolean(subscription);
    button.setAttribute("aria-checked", String(active));
    button.classList.toggle("is-on", active);
    button.setAttribute("aria-label", active ? "Desativar notificações push" : "Ativar notificações push");
    status.textContent = Notification.permission === "denied" ? "Permissão bloqueada nas configurações do navegador." : active ? "Ativas neste dispositivo." : "Ative para receber avisos mesmo sem o Simple Chat aberto.";
    button.disabled = false;
  } catch (error) {
    button.setAttribute("aria-checked", "false");
    button.classList.remove("is-on");
    status.textContent = error.message;
    button.disabled = false;
  }
}

async function togglePushNotifications() {
  const button = $("#notificationsButton");
  const status = $("#notificationsStatus");
  button.disabled = true;
  status.textContent = "";
  try {
    const registration = await navigator.serviceWorker.register("/service-worker.js");
    let subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await api("/api/push/unsubscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }) });
      await subscription.unsubscribe();
      status.textContent = "Notificações desativadas neste dispositivo.";
    } else {
      const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
      if (permission !== "granted") throw new Error("Permita notificações nas configurações do navegador e tente novamente.");
      const { public_key: publicKey } = await api("/api/push/public-key");
      subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) });
      await api("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription.toJSON()) });
      status.textContent = "Notificações ativadas neste dispositivo.";
    }
  } catch (error) {
    status.textContent = error.message;
  } finally {
    const outcome = status.textContent;
    await updateNotificationsButton();
    if (outcome) status.textContent = outcome;
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
  linkToProfile(avatar, user.id);
  const info = document.createElement("div");
  info.className = "row-info";
  const name = document.createElement("strong");
  name.textContent = user.nome_completo || user.username;
  if (user.verificado) {
    const verified = document.createElement("span");
    verified.className = "verified-badge";
    verified.textContent = "✓";
    name.append(" ", verified);
  }
  const username = document.createElement("span");
  username.className = "contact-username";
  username.textContent = `@${user.username}`;
  info.append(name, username);
  if (typeof user.online === "boolean") {
    const presence = document.createElement("span");
    presence.className = `user-presence${user.online ? " is-online" : ""}`;
    presence.textContent = user.online ? "Online" : "Offline";
    info.append(presence);
  }
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
    if (appState.friend) {
      const refreshed = friends.find((item) => item.id === appState.friend.id);
      if (refreshed) {
        appState.friend = refreshed;
        updateChatPresence(refreshed);
      }
    }
    renderPending(pending);
    renderGroups(groups);
    renderGroupInvites(groupInvites);
    refreshSocialNotificationBadge();
  } catch (error) {
    if (!appState.me) return;
    console.warn("Falha ao atualizar listas:", error.message);
  }
}

async function loadAdminUsers() {
  if (!appState.me?.is_admin) return;
  const list = $("#adminUserList");
  list.replaceChildren();
  try {
    const users = await api(`/api/admin/usuarios?q=${encodeURIComponent($("#adminSearch").value.trim())}`);
    $("#adminCount").textContent = `${users.length} contas`;
    for (const user of users) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "admin-user-row";
      const avatar = document.createElement("div");
      avatar.className = "avatar";
      setAvatar(avatar, user);
      const details = document.createElement("span");
      details.className = "admin-user-details";
      const name = document.createElement("strong");
      name.textContent = `${user.nome_completo} · @${user.username}`;
      const status = document.createElement("span");
      status.textContent = `${user.online ? "Online" : "Offline"}${user.is_admin ? " · Admin" : ""}${user.verificado ? " · Verificado" : ""}`;
      details.append(name, status);
      row.append(avatar, details);
      row.addEventListener("click", () => openAdminEditor(user));
      list.append(row);
    }
    if (!users.length) {
      const empty = document.createElement("p");
      empty.className = "feed-empty";
      empty.textContent = "Nenhuma conta encontrada.";
      list.append(empty);
    }
  } catch (error) {
    const note = document.createElement("p");
    note.className = "feed-empty";
    note.textContent = error.message;
    list.append(note);
  }
}

function openAdminEditor(user) {
  appState.adminEditingUser = user;
  $("#adminUserId").value = user.id;
  $("#adminFullName").value = user.nome_completo || "";
  $("#adminUsername").value = user.username || "";
  $("#adminBirthDate").value = user.data_nascimento || "";
  $("#adminSex").value = user.sexo || "PREFIRO_NAO_INFORMAR";
  $("#adminEmail").value = user.email || "";
  $("#adminPassword").value = "";
  $("#adminVerified").checked = Boolean(user.verificado);
  $("#adminGrant").checked = Boolean(user.is_admin);
  $("#adminGrant").disabled = user.id === appState.me.id;
  showError($("#adminEditError"), "");
  $("#adminEditModal").classList.remove("hidden");
}

function renderFriends(friends) {
  appState.friends = friends;
  const unreadConversations = friends.filter((friend) => Number(friend.nao_lidas) > 0).length;
  const unreadBadge = $("#conversationUnreadBadge");
  unreadBadge.textContent = unreadConversations > 99 ? "99+" : String(unreadConversations);
  unreadBadge.classList.toggle("hidden", unreadConversations === 0);
  friendsList.replaceChildren();
  if (!friends.length) {
    const note = document.createElement("div");
    note.className = "empty-note";
    note.textContent = "As conversas aparecem quando vocês seguem um ao outro.";
    friendsList.append(note);
    return;
  }
  for (const friend of friends) {
    const row = document.createElement("div");
    row.setAttribute("role", "button");
    row.tabIndex = 0;
    row.className = "list-row friend-row";
    row.classList.toggle("active", appState.friend?.id === friend.id);
    const avatar = document.createElement("div");
    avatar.className = "avatar";
    setAvatar(avatar, friend);
    linkToProfile(avatar, friend.id);
    const info = document.createElement("div");
    info.className = "row-info";
    const name = document.createElement("strong");
    name.textContent = friend.nome_completo || friend.username;
    if (friend.verificado) {
      const verified = document.createElement("span");
      verified.className = "verified-badge";
      verified.textContent = "✓";
      verified.title = "Conta verificada";
      name.append(" ", verified);
    }
    const username = document.createElement("span");
    username.className = "contact-username";
    username.textContent = `@${friend.username}`;
    const presence = document.createElement("span");
    presence.className = `user-presence${friend.online ? " is-online" : ""}`;
    presence.textContent = friend.online ? "Online" : "Offline";
    info.append(name, username, presence);
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
    row.addEventListener("keydown", (event) => {
      if (event.target === row && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        openChat(friend);
      }
    });
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
  showMainView("chat");
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
  updateChatPresence(friend);
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
  showMainView("chat");
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
  $("#chatVerified").classList.add("hidden");
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

function updateChatPresence(friend) {
  if (!friend || appState.group) return;
  $("#chatSubtitle").textContent = friend.online ? "Online" : "Offline";
  $("#chatVerified").classList.toggle("hidden", !friend.verificado);
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
      if (message.id <= appState.maxId) {
        if (message.apagada) appendMessage(message);
        continue;
      }
      appendMessage(message);
      appState.maxId = Math.max(appState.maxId, message.id);
    }
    await refreshMessageReadStatuses(friend, group);
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

async function refreshMessageReadStatuses(friend = appState.friend, group = appState.group) {
  if (friend) {
    const readIds = new Set(await api(`/api/mensagens/${friend.id}/leituras`));
    if (appState.friend?.id !== friend.id) return;
    for (const row of messagesEl.querySelectorAll(".message-row.mine")) {
      const status = row.querySelector(".read-status");
      if (!status) continue;
      const read = readIds.has(Number(row.dataset.messageId));
      status.textContent = read ? "✓✓ Lida" : "✓ Enviada";
      status.classList.toggle("is-read", read);
    }
  } else if (group) {
    const statuses = await api(`/api/grupos/${group.id}/leituras`);
    if (appState.group?.id !== group.id) return;
    for (const item of statuses) {
      const status = messagesEl.querySelector(`[data-message-id="${item.id}"] .read-status`);
      if (!status) continue;
      const total = Number(item.total_leitores) || 0;
      const read = Number(item.leituras) || 0;
      status.textContent = total && read >= total ? "✓✓ Lida por todos" : `✓ Lida ${read}/${total}`;
      status.classList.toggle("is-read", total > 0 && read >= total);
    }
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
    linkToProfile(sender, message.remetente_id);
    bubble.append(sender);
  }
  if (!message.apagada && message.resposta) {
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
  if (!message.apagada && message.menciona_me) {
    const notice = document.createElement("span");
    notice.className = "mention-notice";
    notice.textContent = "@ Você foi mencionado";
    bubble.append(notice);
  }
  if (message.apagada) {
    const deleted = document.createElement("div");
    deleted.className = "message-text deleted-message";
    deleted.textContent = "Mensagem apagada para todos";
    bubble.append(deleted);
  } else if (message.tipo === "TEXTO") {
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
  if (mine && !message.apagada) {
    const readStatus = document.createElement("span");
    readStatus.className = `read-status${message.lida || (message.total_leitores > 0 && message.leituras >= message.total_leitores) ? " is-read" : ""}`;
    if (appState.friend) readStatus.textContent = message.lida ? "✓✓ Lida" : "✓ Enviada";
    else {
      const total = Number(message.total_leitores) || 0;
      const read = Number(message.leituras) || 0;
      readStatus.textContent = total && read >= total ? "✓✓ Lida por todos" : `✓ Lida ${read}/${total}`;
    }
    footer.append(readStatus);
  }
  if (!message.apagada) {
    const reply = document.createElement("button");
    reply.type = "button";
    reply.className = "reply-action";
    reply.textContent = "Responder";
    reply.addEventListener("click", () => setReplyTarget(message));
    footer.append(reply);
  }
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "reply-action delete-message-action";
  remove.textContent = "Apagar";
  remove.addEventListener("click", () => openDeleteMessage(message));
  footer.append(remove);
  bubble.append(footer);
  row.append(bubble);
  const oldRow = messagesEl.querySelector(`[data-message-id="${message.id}"]`);
  if (oldRow) oldRow.replaceWith(row);
  else messagesEl.append(row);
}

function openDeleteMessage(message) {
  appState.deleteTarget = message;
  showError($("#deleteMessageError"), "");
  const canDeleteForEveryone = message.remetente_id === appState.me.id && !message.apagada;
  $("#deleteForEveryoneButton").classList.toggle("hidden", !canDeleteForEveryone);
  $("#deleteMessageModal").classList.remove("hidden");
}

async function deleteSelectedMessage(forEveryone) {
  const message = appState.deleteTarget;
  if (!message) return;
  const endpoint = appState.group
    ? `/api/grupos/${appState.group.id}/mensagens/${message.id}/apagar`
    : `/api/mensagens/${message.id}/apagar`;
  const buttons = [$("#deleteForMeButton"), $("#deleteForEveryoneButton")];
  buttons.forEach((button) => { button.disabled = true; });
  showError($("#deleteMessageError"), "");
  try {
    await api(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ para_todos: forEveryone }) });
    $("#deleteMessageModal").classList.add("hidden");
    appState.deleteTarget = null;
    if (forEveryone) await fetchMessages(false);
    else {
      messagesEl.querySelector(`[data-message-id="${message.id}"]`)?.remove();
      if (!messagesEl.childElementCount) {
        const empty = document.createElement("p");
        empty.className = "empty-chat";
        empty.textContent = "Esta conversa estÃ¡ comeÃ§ando. Envie a primeira mensagem.";
        messagesEl.append(empty);
      }
    }
    await refreshLists();
  } catch (error) { showError($("#deleteMessageError"), error.message); }
  finally { buttons.forEach((button) => { button.disabled = false; }); }
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
    const row = makeRow(user, "Seguir", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        await followUser(user.id);
        button.textContent = "Seguindo";
      } catch (error) {
        button.disabled = false;
        button.textContent = error.message;
      }
    });
    searchResults.append(row);
  }
}

async function followUser(userId) {
  await api(`/api/usuarios/${userId}/seguir`, { method: "POST" });
  await refreshLists();
  if (appState.viewedProfile?.id === userId) await loadProfileView(userId);
}

function setFeedTab(tab) {
  appState.feedTab = tab;
  const following = tab === "following";
  $("#followingTab").classList.toggle("active", following);
  $("#suggestionsTab").classList.toggle("active", !following);
  $("#postForm").classList.toggle("hidden", !following);
  $("#feedPosts").classList.toggle("hidden", !following);
  $("#loadMorePostsButton").classList.toggle("hidden", !following || !appState.feedHasMore);
  $("#suggestionsPane").classList.toggle("hidden", following);
  if (following) loadFeed(true);
  else loadSuggestions();
}

async function loadSuggestions() {
  const list = $("#suggestionsList");
  list.replaceChildren();
  try {
    const users = await api("/api/sugestoes");
    if (!users.length) {
      const note = document.createElement("p");
      note.className = "feed-empty";
      note.textContent = "Você já está seguindo todas as contas disponíveis.";
      list.append(note);
      return;
    }
    for (const user of users) {
      const row = makeRow(user, "Seguir", async (event) => {
        const button = event.currentTarget;
        button.disabled = true;
        try {
          await followUser(user.id);
          row.remove();
        } catch (error) { button.disabled = false; button.textContent = error.message; }
      });
      row.classList.add("suggestion-row");
      const info = row.querySelector(".row-info");
      const count = document.createElement("span");
      count.textContent = `${user.seguidores} seguidores`;
      info.append(count);
      list.append(row);
    }
  } catch (error) {
    const note = document.createElement("p");
    note.className = "feed-empty";
    note.textContent = error.message;
    list.append(note);
  }
}

async function refreshSocialNotificationBadge() {
  try {
    const result = await api("/api/notificacoes/contagem");
    const badge = $("#socialNotificationBadge");
    badge.textContent = result.nao_lidas > 99 ? "99+" : String(result.nao_lidas);
    badge.classList.toggle("hidden", !result.nao_lidas);
  } catch { /* a tela segue utilizável enquanto a contagem atualiza */ }
}

async function loadSocialNotifications() {
  const list = $("#notificationsList");
  list.replaceChildren();
  try {
    const result = await api("/api/notificacoes");
    if (!result.itens.length) {
      const note = document.createElement("p");
      note.className = "feed-empty";
      note.textContent = "Você ainda não tem notificações.";
      list.append(note);
    }
    for (const notification of result.itens) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = `social-notification${notification.lida ? "" : " unread"}`;
      const avatar = document.createElement("div");
      avatar.className = "avatar";
      setAvatar(avatar, { username: notification.username, foto: notification.foto });
      const copy = document.createElement("span");
      const actor = notification.nome_completo || notification.username;
      const action = notification.tipo === "SEGUIDOR" ? "começou a seguir você" : notification.tipo === "CURTIDA" ? "curtiu sua publicação" : notification.tipo === "COMENTARIO" ? "comentou na sua publicação" : "fez uma nova publicação";
      copy.textContent = `${actor} ${action}${notification.texto ? `: ${notification.texto.slice(0, 100)}` : ""}`;
      const time = document.createElement("time");
      time.textContent = feedTime(notification.criado_em);
      item.append(avatar, copy, time);
      item.addEventListener("click", () => openUserProfile(notification.ator_id, "notifications"));
      list.append(item);
    }
    await api("/api/notificacoes/ler", { method: "POST" });
    $("#socialNotificationBadge").classList.add("hidden");
  } catch (error) {
    const note = document.createElement("p");
    note.className = "feed-empty";
    note.textContent = error.message;
    list.append(note);
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
    await showApp(user);
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
    if ($("#profileAvatar")) setAvatar($("#profileAvatar"), appState.me, true);
    if ($("#feedComposerAvatar")) setAvatar($("#feedComposerAvatar"), appState.me);
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
    $("#editBio").value = profile.bio || "";
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
        bio: $("#editBio").value.trim(),
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
    appState.me.bio = result.bio;
    $("#myUsername").textContent = result.username;
    appScreen.inert = false;
    $("#emailGate").classList.add("hidden");
    $("#profileModal").classList.add("hidden");
    await loadProfileView(appState.me.id);
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
    await updateNotificationsButton();
    stopListPolling();
    appState.listsTimer = window.setInterval(refreshLists, 10000);
  } catch (error) { showError($("#emailNoticeError"), error.message); }
  finally { button.disabled = false; }
});

$("#notificationsButton").addEventListener("click", togglePushNotifications);
$("#closeDeleteMessageModal").addEventListener("click", () => { $("#deleteMessageModal").classList.add("hidden"); appState.deleteTarget = null; });
$("#deleteMessageModal").addEventListener("click", (event) => {
  if (event.target.id === "deleteMessageModal") { event.currentTarget.classList.add("hidden"); appState.deleteTarget = null; }
});
$("#deleteForMeButton").addEventListener("click", () => deleteSelectedMessage(false));
$("#deleteForEveryoneButton").addEventListener("click", () => deleteSelectedMessage(true));

$("#emailGateLogout").addEventListener("click", async () => {
  try { await api("/api/logout", { method: "POST" }); } catch { /* encerra localmente */ }
  showAuth();
});

$("#logoutButton").addEventListener("click", async () => {
  try { await api("/api/logout", { method: "POST" }); } catch { /* a tela também encerra localmente */ }
  clearPreview();
  showAuth();
});

$("#profileLogoutButton").addEventListener("click", async () => {
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

async function goHome() {
  showMainView("home");
  setFeedTab("following");
  await loadFeed(true);
}

$("#brandHomeButton").addEventListener("click", goHome);
$("#navHome").addEventListener("click", goHome);
$("#navConversations").addEventListener("click", () => showMainView("conversations"));
$("#navNotifications").addEventListener("click", async () => { showMainView("notifications"); await loadSocialNotifications(); });
$("#navAdmin").addEventListener("click", async () => {
  if (!appState.me?.is_admin) return;
  showMainView("admin");
  await loadAdminUsers();
});
$("#refreshAdminButton").addEventListener("click", loadAdminUsers);
$("#adminSearch").addEventListener("input", () => {
  window.clearTimeout(appState.adminSearchTimer);
  appState.adminSearchTimer = window.setTimeout(loadAdminUsers, 250);
});
$("#closeAdminEditModal").addEventListener("click", () => $("#adminEditModal").classList.add("hidden"));
$("#adminEditModal").addEventListener("click", (event) => {
  if (event.target.id === "adminEditModal") event.currentTarget.classList.add("hidden");
});
$("#adminEditForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const user = appState.adminEditingUser;
  if (!user) return;
  const submit = event.currentTarget.querySelector("button[type='submit']");
  submit.disabled = true;
  showError($("#adminEditError"), "");
  try {
    await api(`/api/admin/usuarios/${user.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome_completo: $("#adminFullName").value.trim(), username: $("#adminUsername").value.trim(),
        data_nascimento: $("#adminBirthDate").value, sexo: $("#adminSex").value,
        email: $("#adminEmail").value.trim(), senha: $("#adminPassword").value,
        verificado: $("#adminVerified").checked, is_admin: $("#adminGrant").checked,
      }),
    });
    if (user.id === appState.me.id) {
      appState.me.username = $("#adminUsername").value.trim();
      appState.me.nome_completo = $("#adminFullName").value.trim();
      appState.me.email = $("#adminEmail").value.trim();
      $("#myUsername").textContent = appState.me.username;
    }
    $("#adminEditModal").classList.add("hidden");
    await loadAdminUsers();
  } catch (error) { showError($("#adminEditError"), error.message); }
  finally { submit.disabled = false; }
});
$("#adminDeleteButton").addEventListener("click", async () => {
  const user = appState.adminEditingUser;
  if (!user || user.id === appState.me.id || !window.confirm(`Excluir a conta @${user.username}? Esta ação também remove conversas e dados relacionados.`)) return;
  try {
    await api(`/api/admin/usuarios/${user.id}`, { method: "DELETE" });
    $("#adminEditModal").classList.add("hidden");
    await loadAdminUsers();
    await refreshLists();
  } catch (error) { showError($("#adminEditError"), error.message); }
});
$("#navProfile").addEventListener("click", async () => { await openUserProfile(appState.me.id, "home"); });
$("#followingTab").addEventListener("click", () => setFeedTab("following"));
$("#suggestionsTab").addEventListener("click", () => setFeedTab("suggestions"));
$("#refreshNotificationsButton").addEventListener("click", loadSocialNotifications);
$("#followProfileButton").addEventListener("click", async () => {
  const profile = appState.viewedProfile;
  if (!profile) return;
  const button = $("#followProfileButton");
  button.disabled = true;
  try {
    if (profile.seguindo_por_mim) await api(`/api/usuarios/${profile.id}/seguir`, { method: "DELETE" });
    else await api(`/api/usuarios/${profile.id}/seguir`, { method: "POST" });
    await refreshLists();
    await loadProfileView(profile.id);
  } catch (error) { window.alert(error.message); }
  finally { button.disabled = false; }
});
$("#newPostButton").addEventListener("click", () => { showMainView("home"); $("#postText").focus(); });
$("#profileEditLink").addEventListener("click", () => $("#editProfileButton").click());
$("#profileBackButton").addEventListener("click", () => {
  if (appState.profileReturnView === "profile" && appState.profileReturnUserId) {
    showMainView("profile");
    loadProfileView(appState.profileReturnUserId);
  } else showMainView(appState.profileReturnView || "home");
});
$("#myAvatar").addEventListener("click", () => { if (appState.me) openUserProfile(appState.me.id); });
$("#feedComposerAvatar").addEventListener("click", () => { if (appState.me) openUserProfile(appState.me.id); });
$("#chatAvatar").addEventListener("click", () => { if (appState.friend) openUserProfile(appState.friend.id, "chat"); });
$("#chatUsername").addEventListener("click", () => { if (appState.friend) openUserProfile(appState.friend.id, "chat"); });
$("#refreshFeedButton").addEventListener("click", () => loadFeed(true));
$("#loadMorePostsButton").addEventListener("click", () => loadFeed(false));
$("#loadMoreProfilePostsButton").addEventListener("click", () => {
  if (appState.viewedProfile) loadProfilePosts(appState.viewedProfile.id, false);
});
$("#refreshButton").addEventListener("click", refreshLists);
$("#postFileInput").addEventListener("change", () => {
  const file = $("#postFileInput").files[0];
  selectedPostFile = file || null;
  const preview = $("#postAttachmentPreview");
  preview.replaceChildren();
  if (postPreviewUrl) URL.revokeObjectURL(postPreviewUrl);
  postPreviewUrl = null;
  if (!file) { preview.classList.add("hidden"); return; }
  postPreviewUrl = URL.createObjectURL(file);
  const media = file.type.startsWith("video/") ? document.createElement("video") : document.createElement("img");
  media.src = postPreviewUrl;
  media.className = "post-preview-media";
  if (media.tagName === "VIDEO") { media.controls = true; media.muted = true; }
  const name = document.createElement("span");
  name.textContent = file.name;
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "text-button";
  remove.textContent = "Remover";
  remove.addEventListener("click", () => { $("#postFileInput").value = ""; $("#postFileInput").dispatchEvent(new Event("change")); });
  preview.append(media, name, remove);
  preview.classList.remove("hidden");
});

$("#postForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("#publishPostButton");
  button.disabled = true;
  showError($("#postError"), "");
  const body = new FormData();
  body.append("texto", $("#postText").value.trim());
  if (selectedPostFile) body.append("arquivo", selectedPostFile);
  try {
    await api("/api/feed/posts", { method: "POST", body });
    $("#postText").value = "";
    $("#postFileInput").value = "";
    $("#postFileInput").dispatchEvent(new Event("change"));
    await loadFeed(true);
    $("#postText").focus();
  } catch (error) { showError($("#postError"), error.message); }
  finally { button.disabled = false; }
});
$("#findPeopleButton").addEventListener("click", () => { searchInput.focus(); searchInput.scrollIntoView({ behavior: "smooth", block: "center" }); });
$("#backButton").addEventListener("click", () => { stopChatPolling(); clearPreview(); clearReplyTarget(); hideMentionSuggestions(); appState.friend = null; appState.group = null; appState.groupMembers = []; showMainView("conversations"); renderFriendsHighlight(); renderGroupHighlight(); });

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
        ? "Todos os seus contatos já participam deste grupo."
        : "Siga alguém e sigam um ao outro antes de convidar para o grupo.";
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
$("#closeRelationsModal").addEventListener("click", () => $("#relationsModal").classList.add("hidden"));
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
    $("#deleteMessageModal").classList.add("hidden");
  }
});

setAuthMode(false);

// Recupera a sessão existente ao abrir a aplicação.
(async function init() {
  try { await showApp(await api("/api/eu")); }
  catch { /* a tela de login já está visível */ }
})();
