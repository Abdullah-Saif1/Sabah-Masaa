// One-time data pull: per-verse mushaf metadata (juz, standard 604-page
// number, sajdah markers) needed for a real mushaf-style continuous page
// view. Output is committed, same rationale as fetch-quran-data.js.
"use strict";
const fs = require("fs");
const path = require("path");
const https = require("https");

const outDir = path.join(__dirname, "..", "public", "data");

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "sabah-masaa-build-script" } }, (res) => {
      if (res.statusCode !== 200) { reject(new Error(url + " -> " + res.statusCode)); return; }
      // Accumulate raw Buffer chunks and decode once (see fetch-quran-data.js
      // for why: per-chunk string decoding corrupts multi-byte characters
      // split across a chunk boundary). This endpoint's payload is numeric
      // only today, but keep the safe pattern consistent everywhere.
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch (e) { reject(e); }
      });
    }).on("error", reject);
  });
}

async function main() {
  const meta = {}; // verse_key -> { j: juz_number, p: page_number, s: sajdah_number|null }
  for (let juz = 1; juz <= 30; juz++) {
    let page = 1;
    let count = 0;
    for (;;) {
      const url = "https://api.quran.com/api/v4/verses/by_juz/" + juz +
        "?per_page=350&page=" + page + "&fields=juz_number,page_number,sajdah_number";
      const res = await fetchJSON(url);
      res.verses.forEach((v) => {
        meta[v.verse_key] = { j: v.juz_number, p: v.page_number, s: v.sajdah_number || null };
      });
      count += res.verses.length;
      if (!res.pagination.next_page) break;
      page = res.pagination.next_page;
    }
    console.log("juz " + juz + ": " + count + " verses");
  }

  const total = Object.keys(meta).length;
  console.log("total verses with metadata:", total);
  if (total !== 6236) {
    console.error("WARNING: expected 6236 verses, got " + total);
  }

  fs.writeFileSync(path.join(outDir, "quran-mushaf-meta.json"), JSON.stringify(meta));
  const size = fs.statSync(path.join(outDir, "quran-mushaf-meta.json")).size;
  console.log("wrote quran-mushaf-meta.json:", (size / 1024).toFixed(1) + "KB");
}

main().catch((err) => { console.error(err); process.exit(1); });
