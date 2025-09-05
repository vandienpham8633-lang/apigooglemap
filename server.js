import express from "express";
import fetch from "node-fetch";
import Database from "better-sqlite3";

const app = express();
const PORT = process.env.PORT || 3000;

// Khởi tạo SQLite DB (sẽ tạo file cache.db trong container)
const db = new Database("cache.db");
db.prepare(
  "CREATE TABLE IF NOT EXISTS cache (lat REAL, lng REAL, result TEXT, PRIMARY KEY(lat,lng))"
).run();

// Hàm gọi Nominatim có delay 1 request/giây
let lastRequest = 0;
async function callNominatim(lat, lon) {
  const now = Date.now();
  if (now - lastRequest < 1100) {
    await new Promise((r) => setTimeout(r, 1100 - (now - lastRequest)));
  }
  lastRequest = Date.now();

  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=vi`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "MyApp/1.0 (your-email@example.com)" // bắt buộc cho Nominatim
    }
  });
  return res.json();
}

app.get("/", (req, res) => {
  res.send("OSM Proxy API is running. Try /address?lat=10.762622&lng=106.660172");
});

app.get("/address", async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng)
    return res.status(400).json({ error: "Missing lat or lng" });

  // Kiểm tra cache trong SQLite
  const row = db.prepare("SELECT result FROM cache WHERE lat=? AND lng=?").get(lat, lng);
  if (row) {
    return res.json({ source: "cache", ...JSON.parse(row.result) });
  }

  try {
    const data = await callNominatim(lat, lng);
    const result = {
      display_name: data.display_name || null,
      address: data.address || null
    };

    // Lưu cache
    db.prepare("INSERT OR REPLACE INTO cache (lat, lng, result) VALUES (?, ?, ?)")
      .run(lat, lng, JSON.stringify(result));

    res.json({ source: "nominatim", ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
