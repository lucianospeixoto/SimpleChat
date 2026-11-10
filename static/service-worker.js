"use strict";

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; }
  catch { payload = { body: event.data?.text() || "Você recebeu uma nova mensagem." }; }
  const url = new URL(payload.url || "/", self.location.origin);
  if (url.origin !== self.location.origin) url.pathname = "/";
  event.waitUntil(self.registration.showNotification(payload.title || "Simple Chat", {
    body: payload.body || "Você recebeu uma nova mensagem.",
    icon: "/icon.svg",
    badge: "/icon.svg",
    tag: payload.tag || "simple-chat",
    data: { url: `${url.pathname}${url.search}` },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin);
  if (target.origin !== self.location.origin) target.pathname = "/";
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.navigate(target.href);
        return client.focus();
      }
    }
    return self.clients.openWindow(target.href);
  })());
});
