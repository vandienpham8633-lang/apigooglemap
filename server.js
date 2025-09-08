import express from "express";
import fetch from "node-fetch";
import Database from "better-sqlite3";
import PQueue from "p-queue";

const app = express();
const PORT = process.env.PORT || 3000;

// === SQLite cache ===
const db = new Database("cache.db");
db.prepare(
  "CREATE TABLE IF NOT EXISTS cache (lat REAL, lng REAL, result TEXT, PRIMARY KEY(lat,lng))"
).run();

// === Queue: max 1 request / giây ===
const queue = new PQueue({ concurrency: 1, interval: 1000, intervalCap: 1 });

// Hàm gọi nominatim qua queue
async function callNominatim(lat, lon) {
  return queue.add(async () => {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=vi`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": "MyApp/1.0 (your-email@example.com)" // thay email của bạn
      }
    });

    if (!res.ok) {
      throw new Error(`Nominatim error: ${res.status}`);
    }

    return res.json();
  });
}

// === Routes ===
app.get("/", (req, res) => {
  res.send("✅ OSM Proxy is running. Try /address?lat=10.762622&lng=106.660172");
});

app.get("/address", async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng)
    return res.status(400).json({ error: "Missing lat or lng" });

  // Kiểm tra cache
  const row = db
    .prepare("SELECT result FROM cache WHERE lat=? AND lng=?")
    .get(lat, lng);

  if (row) {
    return res.json({ source: "cache", ...JSON.parse(row.result) });
  }

  try {
    const data = await callNominatim(lat, lng);

    const result = {
      display_name: data.display_name || null,
      address: data.address || null
    };

    db.prepare(
      "INSERT OR REPLACE INTO cache (lat, lng, result) VALUES (?, ?, ?)"
    ).run(lat, lng, JSON.stringify(result));

    res.json({ source: "nominatim", ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Route debug: xem toàn bộ cache
app.get("/all-cache", (req, res) => {
  const rows = db.prepare("SELECT lat, lng, result FROM cache").all();
  res.json(rows.map(r => ({ lat: r.lat, lng: r.lng, ...JSON.parse(r.result) })));
});

const port = process.env.PORT || 10000; // Render sẽ inject PORT
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});

