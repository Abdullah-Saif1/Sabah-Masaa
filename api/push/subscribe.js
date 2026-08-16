// POST /api/push/subscribe
// Body: { subscription: {endpoint, keys:{p256dh,auth}}, location:{lat,lon,label},
//         calcMethod, madhab, notifPrefs:{fajr,dhuhr,asr,maghrib,isha} }
const { getDb } = require("../../lib/mongodb");
const { CALC_METHODS, PRAYER_KEYS } = require("../../lib/prayer-shared");

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
    if (!body || typeof body !== "object") {
      res.status(400).json({ error: "Invalid body" });
      return;
    }

    const sub = body.subscription;
    if (!sub || typeof sub.endpoint !== "string" || sub.endpoint.length < 10 || sub.endpoint.length > 2000) {
      res.status(400).json({ error: "Invalid subscription" });
      return;
    }
    const keys = sub.keys || {};
    if (typeof keys.p256dh !== "string" || typeof keys.auth !== "string") {
      res.status(400).json({ error: "Invalid subscription keys" });
      return;
    }

    const loc = body.location || {};
    const lat = Number(loc.lat);
    const lon = Number(loc.lon);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
      res.status(400).json({ error: "Invalid location" });
      return;
    }
    const label = typeof loc.label === "string" ? loc.label.slice(0, 120) : "";

    const calcMethod = CALC_METHODS.includes(body.calcMethod) ? body.calcMethod : "MuslimWorldLeague";
    const madhab = body.madhab === "hanafi" ? "hanafi" : "shafi";

    const prefsIn = body.notifPrefs && typeof body.notifPrefs === "object" ? body.notifPrefs : {};
    const notifPrefs = {};
    PRAYER_KEYS.forEach((k) => { notifPrefs[k] = !!prefsIn[k]; });

    const db = await getDb();
    await db.collection("pushSubscriptions").updateOne(
      { _id: sub.endpoint },
      {
        $set: {
          keys: { p256dh: keys.p256dh, auth: keys.auth },
          location: { lat, lon, label },
          calcMethod, madhab, notifPrefs,
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date(), lastSent: { date: "", prayers: [] } },
      },
      { upsert: true }
    );

    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};
