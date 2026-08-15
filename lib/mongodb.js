// Reuses a single MongoClient across warm serverless invocations, per Vercel/MongoDB guidance.
const { MongoClient } = require("mongodb");

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "sabah_masaa";

if (!uri) {
  // Thrown lazily at request time (not at cold-start import) so the rest of
  // the function can still return a clear 500 instead of crashing the build.
}

let cachedClient = global._mongoClient;
let cachedClientPromise = global._mongoClientPromise;

function getClientPromise() {
  if (!uri) {
    throw new Error("MONGODB_URI is not set");
  }
  if (cachedClientPromise) return cachedClientPromise;
  cachedClient = new MongoClient(uri, {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 8000,
  });
  cachedClientPromise = cachedClient.connect();
  global._mongoClient = cachedClient;
  global._mongoClientPromise = cachedClientPromise;
  return cachedClientPromise;
}

async function getDb() {
  const client = await getClientPromise();
  return client.db(dbName);
}

module.exports = { getDb };
