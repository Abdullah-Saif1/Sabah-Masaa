// One-time setup: creates a TTL index so linked-device progress documents
// auto-expire 90 days after their last update, instead of accumulating
// forever. Safe to re-run. Needs MONGODB_URI in the environment:
//   MONGODB_URI="mongodb+srv://..." node scripts/init-db.js
"use strict";
const { MongoClient } = require("mongodb");

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("Set MONGODB_URI first, e.g.:\n  MONGODB_URI=\"mongodb+srv://...\" node scripts/init-db.js");
    process.exit(1);
  }
  const dbName = process.env.MONGODB_DB || "sabah_masaa";
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const ninetyDaysSeconds = 60 * 60 * 24 * 90;
  await db.collection("progress").createIndex(
    { updatedAt: 1 },
    { expireAfterSeconds: ninetyDaysSeconds, name: "updatedAt_ttl" }
  );
  console.log(`TTL index ready on ${dbName}.progress (expires 90 days after last update).`);
  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
