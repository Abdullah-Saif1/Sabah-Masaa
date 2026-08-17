// One-time data pull from api.quran.com into public/data/*.json.
// Re-run only if the source data needs refreshing — output is committed,
// so the app never depends on quran.com's uptime for reading the text.
"use strict";
const fs = require("fs");
const path = require("path");
const https = require("https");

const outDir = path.join(__dirname, "..", "public", "data");
fs.mkdirSync(outDir, { recursive: true });

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "sabah-masaa-build-script" } }, (res) => {
      if (res.statusCode !== 200) { reject(new Error(url + " -> " + res.statusCode)); return; }
      // Accumulate raw Buffer chunks and decode once at the end. Decoding
      // each chunk to a string independently (the previous `data += chunk`
      // pattern) corrupts any multi-byte UTF-8 character that happens to
      // fall across a chunk boundary -- this silently mangled ~80 ayat of
      // Arabic text into U+FFFD replacement characters last time.
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch (e) { reject(e); }
      });
    }).on("error", reject);
  });
}

async function main() {
  console.log("Fetching chapters...");
  const chaptersRes = await fetchJSON("https://api.quran.com/api/v4/chapters?language=ar");
  const chaptersResEn = await fetchJSON("https://api.quran.com/api/v4/chapters?language=en");
  const enByCode = {};
  chaptersResEn.chapters.forEach((c) => { enByCode[c.id] = c.translated_name.name; });

  const chapters = chaptersRes.chapters.map((c) => ({
    id: c.id,
    nameAr: c.name_arabic,
    nameSimple: c.name_simple,
    nameTranslatedEn: enByCode[c.id] || c.name_simple,
    versesCount: c.verses_count,
    revelationPlace: c.revelation_place,
    revelationOrder: c.revelation_order,
    bismillahPre: c.bismillah_pre,
  }));
  fs.writeFileSync(path.join(outDir, "chapters.json"), JSON.stringify(chapters));
  console.log("wrote chapters.json:", chapters.length, "chapters");

  console.log("Fetching full Quran text (Uthmani)...");
  const versesRes = await fetchJSON("https://api.quran.com/api/v4/quran/verses/uthmani");
  // Compact format: { "1:1": "بِسْمِ..." , ... } — smaller than the array-of-objects source.
  const verseMap = {};
  versesRes.verses.forEach((v) => { verseMap[v.verse_key] = v.text_uthmani; });
  fs.writeFileSync(path.join(outDir, "quran-uthmani.json"), JSON.stringify(verseMap));
  console.log("wrote quran-uthmani.json:", Object.keys(verseMap).length, "verses");

  var sizeChapters = fs.statSync(path.join(outDir, "chapters.json")).size;
  var sizeVerses = fs.statSync(path.join(outDir, "quran-uthmani.json")).size;
  console.log("sizes: chapters.json", (sizeChapters / 1024).toFixed(1) + "KB", "quran-uthmani.json", (sizeVerses / 1024).toFixed(1) + "KB");
}

main().catch((err) => { console.error(err); process.exit(1); });
