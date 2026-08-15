// Vercel serverless function: GET/POST /api/progress
// Stores today's adhkar tap-counters under a user-chosen sync code so the
// same progress can be read back from another device. No accounts — the
// code itself is the capability token, matching the "personal, low-stakes"
// tradeoff the app describes in its Sync panel.

const { getDb } = require("../lib/mongodb");

const CODE_RE = /^[A-Z0-9-]{4,16}$/;

function normalizeCode(raw) {
  if (Array.isArray(raw)) raw = raw[0];
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  return CODE_RE.test(code) ? code : null;
}

function normalizePeriod(p) {
  if (!p || typeof p !== "object") return undefined;
  const date = typeof p.date === "string" ? p.date.slice(0, 10) : null;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  const counts = p.counts && typeof p.counts === "object" && !Array.isArray(p.counts) ? p.counts : {};
  // counts: { [cardId]: { [itemIndex]: number } } — clamp to sane bounds.
  const cleanCounts = {};
  let cardTally = 0;
  for (const cardId of Object.keys(counts)) {
    if (cardTally++ > 40) break; // generous ceiling above the app's ~17 cards
    if (typeof cardId !== "string" || cardId.length > 16) continue;
    const perItem = counts[cardId];
    if (!perItem || typeof perItem !== "object") continue;
    const cleanItem = {};
    let itemTally = 0;
    for (const idx of Object.keys(perItem)) {
      if (itemTally++ > 6) break;
      const n = Number(perItem[idx]);
      if (Number.isFinite(n) && n >= 0 && n <= 1000) cleanItem[idx] = Math.floor(n);
    }
    cleanCounts[cardId] = cleanItem;
  }
  return { date, counts: cleanCounts };
}

function normalizeSettings(s) {
  if (!s || typeof s !== "object") return undefined;
  const out = {};
  if (typeof s.showEn === "boolean") out.showEn = s.showEn;
  if (typeof s.showTranslit === "boolean") out.showTranslit = s.showTranslit;
  if (typeof s.arSize === "number" && s.arSize >= 1 && s.arSize <= 3) out.arSize = s.arSize;
  return out;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  try {
    if (req.method === "GET") {
      const code = normalizeCode(req.query && req.query.code);
      if (!code) {
        res.status(400).json({ error: "Missing or invalid code" });
        return;
      }
      const db = await getDb();
      const doc = await db.collection("progress").findOne({ _id: code });
      if (!doc) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      res.status(200).json({
        morning: doc.morning || null,
        evening: doc.evening || null,
        settings: doc.settings || null,
        updatedAt: doc.updatedAt || null,
      });
      return;
    }

    if (req.method === "POST") {
      let body = req.body;
      if (typeof body === "string") {
        try { body = JSON.parse(body); } catch (e) { body = null; }
      }
      if (!body || typeof body !== "object") {
        res.status(400).json({ error: "Invalid body" });
        return;
      }
      const code = normalizeCode(body.code);
      if (!code) {
        res.status(400).json({ error: "Missing or invalid code" });
        return;
      }

      const update = { updatedAt: new Date() };
      const morning = normalizePeriod(body.morning);
      const evening = normalizePeriod(body.evening);
      const settings = normalizeSettings(body.settings);
      if (morning) update.morning = morning;
      if (evening) update.evening = evening;
      if (settings) update.settings = settings;

      const db = await getDb();
      await db.collection("progress").updateOne(
        { _id: code },
        { $set: update, $setOnInsert: { createdAt: new Date() } },
        { upsert: true }
      );
      res.status(200).json({ ok: true });
      return;
    }

    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};
