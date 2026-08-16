// GET /api/cron/prayer-push
// Pinged every 5 minutes by a GitHub Actions workflow (Vercel Hobby only
// allows daily cron, and GitHub Actions' own schedule trigger has a ~5min
// floor plus real-world jitter — see .github/workflows/prayer-push.yml).
// For every push subscription, computes today's prayer times server-side
// and sends a push for any enabled prayer whose time falls within a
// generous window of "now", skipping ones already sent today so repeated
// checks inside that window never double-notify.
const { getDb } = require("../../lib/mongodb");
const { webpush, ensureConfigured } = require("../../lib/webpush");
const { PRAYER_KEYS } = require("../../lib/prayer-shared");

// adhan's published package.json declares "type": "module" for its lib/cjs
// output too, which makes require("adhan") throw ERR_REQUIRE_ESM in
// Vercel's Node runtime. Dynamic import() honors the package's "exports"
// map and correctly resolves the real ESM build instead — cached after the
// first cold-start invocation since this only runs once per module load.
let AdhanPromise = null;
function loadAdhan() {
  if (!AdhanPromise) AdhanPromise = import("adhan");
  return AdhanPromise;
}

const DUE_WINDOW_MS = 6 * 60 * 1000; // 6 minutes — covers a 5-minute check interval plus jitter

const PRAYER_LABELS = {
  fajr: { ar: "الفجر", en: "Fajr" },
  dhuhr: { ar: "الظهر", en: "Dhuhr" },
  asr: { ar: "العصر", en: "Asr" },
  maghrib: { ar: "المغرب", en: "Maghrib" },
  isha: { ar: "العشاء", en: "Isha" },
};

function todayUTC() {
  const d = new Date();
  return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0");
}

function buildParams(Adhan, calcMethod, madhab) {
  const factory = Adhan.CalculationMethod[calcMethod] || Adhan.CalculationMethod.MuslimWorldLeague;
  const params = factory();
  params.madhab = madhab === "hanafi" ? Adhan.Madhab.Hanafi : Adhan.Madhab.Shafi;
  return params;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  const auth = req.headers.authorization || "";
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    ensureConfigured();
  } catch (e) {
    res.status(500).json({ error: "Push not configured" });
    return;
  }

  let Adhan;
  try {
    Adhan = await loadAdhan();
  } catch (e) {
    res.status(500).json({ error: "Prayer time calculation unavailable" });
    return;
  }

  const now = Date.now();
  const today = todayUTC();
  let checked = 0, sent = 0, removed = 0, errors = 0;

  try {
    const db = await getDb();
    const col = db.collection("pushSubscriptions");
    const subs = await col.find({}).toArray();

    for (const sub of subs) {
      checked++;
      try {
        const coords = new Adhan.Coordinates(sub.location.lat, sub.location.lon);
        const params = buildParams(Adhan, sub.calcMethod, sub.madhab);
        const times = new Adhan.PrayerTimes(coords, new Date(), params);

        const alreadySent = sub.lastSent && sub.lastSent.date === today ? sub.lastSent.prayers || [] : [];
        let due = null;

        for (const key of PRAYER_KEYS) {
          if (!sub.notifPrefs || !sub.notifPrefs[key]) continue;
          if (alreadySent.indexOf(key) !== -1) continue;
          const t = times[key];
          // Fire only after the prayer has actually started (never early),
          // within a window wide enough to survive GitHub Actions' ~5min
          // schedule floor and its real-world jitter.
          const elapsed = now - t.getTime();
          if (t && elapsed >= 0 && elapsed <= DUE_WINDOW_MS) {
            due = key;
            break; // one notification per run per subscriber is enough
          }
        }

        if (!due) continue;

        const label = PRAYER_LABELS[due];
        const payload = JSON.stringify({
          title: `حان وقت صلاة ${label.ar}`,
          body: `It's time for ${label.en} prayer.`,
          prayer: due,
        });

        try {
          await webpush.sendNotification({ endpoint: sub._id, keys: sub.keys }, payload);
          sent++;
          const newPrayers = alreadySent.concat(due);
          await col.updateOne({ _id: sub._id }, { $set: { lastSent: { date: today, prayers: newPrayers } } });
        } catch (sendErr) {
          if (sendErr && (sendErr.statusCode === 404 || sendErr.statusCode === 410)) {
            await col.deleteOne({ _id: sub._id });
            removed++;
          } else {
            errors++;
          }
        }
      } catch (perSubErr) {
        errors++;
      }
    }

    res.status(200).json({ ok: true, checked, sent, removed, errors });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};
