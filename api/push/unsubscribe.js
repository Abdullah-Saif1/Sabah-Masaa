// POST /api/push/unsubscribe  Body: { endpoint }
const { getDb } = require("../../lib/mongodb");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  try {
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch (e) { body = null; }
    }
    const endpoint = body && typeof body.endpoint === "string" ? body.endpoint : null;
    if (!endpoint) {
      res.status(400).json({ error: "Missing endpoint" });
      return;
    }
    const db = await getDb();
    await db.collection("pushSubscriptions").deleteOne({ _id: endpoint });
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};
