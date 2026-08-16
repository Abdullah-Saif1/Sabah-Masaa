const webpush = require("web-push");

let configured = false;
function ensureConfigured() {
  if (configured) return;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";
  if (!pub || !priv) throw new Error("VAPID keys not set");
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
}

module.exports = { webpush, ensureConfigured };
