// GET /api/quran/tafsir?verse_key=2:255&edition=ibn-kathir|tabari
// Server-side proxy to api.quran.com so the client never talks to a
// third-party host directly (keeps CORS simple, lets us cache, and hides
// quran.com's internal resource IDs). Tafsir text doesn't change, so
// responses are cached hard at the edge.
const EDITIONS = {
  "ibn-kathir": { id: 14, nameAr: "تفسير ابن كثير", nameEn: "Tafsir Ibn Kathir" },
  "tabari": { id: 15, nameAr: "تفسير الطبري", nameEn: "Tafsir al-Tabari" },
};

const VERSE_KEY_RE = /^[0-9]{1,3}:[0-9]{1,3}$/;

// Defense in depth: the client renders this HTML via innerHTML. quran.com's
// editorial tafsir content is trusted, but strip anything script-capable
// server-side anyway rather than relying solely on the upstream being clean.
function sanitizeTafsirHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/\son\w+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1=""');
}

module.exports = async (req, res) => {
  const verseKey = req.query && req.query.verse_key;
  const editionKey = req.query && req.query.edition;

  if (typeof verseKey !== "string" || !VERSE_KEY_RE.test(verseKey)) {
    res.status(400).json({ error: "Invalid verse_key" });
    return;
  }
  const edition = EDITIONS[editionKey];
  if (!edition) {
    res.status(400).json({ error: "Invalid edition. Use ibn-kathir or tabari." });
    return;
  }

  try {
    const upstream = await fetch(
      `https://api.quran.com/api/v4/tafsirs/${edition.id}/by_ayah/${encodeURIComponent(verseKey)}`,
      { headers: { "User-Agent": "sabah-masaa/1.0" } }
    );
    if (!upstream.ok) {
      res.status(502).json({ error: "Upstream tafsir service error" });
      return;
    }
    const data = await upstream.json();
    const text = data && data.tafsir && typeof data.tafsir.text === "string" ? data.tafsir.text : null;
    if (!text) {
      res.status(404).json({ error: "Tafsir not found for this ayah" });
      return;
    }

    res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400");
    res.status(200).json({
      verseKey,
      edition: editionKey,
      editionNameAr: edition.nameAr,
      editionNameEn: edition.nameEn,
      html: sanitizeTafsirHtml(text),
    });
  } catch (err) {
    res.status(502).json({ error: "Couldn't reach the tafsir service" });
  }
};
