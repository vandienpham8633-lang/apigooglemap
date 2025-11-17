import express from "express";
import fetch from "node-fetch";
import PQueue from "p-queue";
import compression from "compression";
import { Redis } from "@upstash/redis";

// ==== CONFIG ====
const PORT = process.env.PORT || 10000;

const redis = new Redis({
  url: process.env.REDIS_URL,      // đặt trong Render Dashboard
  token: process.env.REDIS_TOKEN   // đặt trong Render Dashboard
});

// ==== Express ====
const app = express();
app.use(compression());

// ==== Queue (1 request/s đúng chuẩn Nominatim) ====
const queue = new PQueue({ concurrency: 1, interval: 1000, intervalCap: 1 });

// ==== Gọi Nominatim ====
async function callNominatim(lat, lon) {
  return queue.add(async () => {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=vi`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": "MyApp/1.0 (contact: youremail@gmail.com)"
      },
      timeout: 7000
    });

    if (res.status === 429) {
      console.log("⚠ Rate limited → retry 3s");
      await new Promise((r) => setTimeout(r, 3000));
      return callNominatim(lat, lon);
    }

    if (!res.ok) throw new Error(`Nominatim error ${res.status}`);

    return res.json();
  });
}

// ==== ROUTES ====
app.get("/", (req, res) => {
  res.send("🚀 Redis OSM API running! Use /address?lat=10.7&lng=106.6");
});

// ==== API LẤY ĐỊA CHỈ ====
app.get("/address", async (req, res) => {
  const { lat, lng } = req.query;

  if (!lat || !lng) return res.status(400).json({ error: "Missing lat or lng" });

  const key = `${lat},${lng}`;

  // 1. KIỂM TRA CACHE REDIS
  const cached = await redis.get(key);
  if (cached) {
    return res.json({ source: "redis", ...cached });
  }

  // 2. GỌI NOMINATIM
  try {
    const data = await callNominatim(lat, lng);

    const result = {
      display_name: data.display_name || "",
      address: data.address || {}
    };

    // 3. LƯU CACHE VÀO REDIS (TTL: 60 ngày)
    await redis.set(key, result, { ex: 5184000 });

    res.json({ source: "nominatim", ...result });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==== TEST REDIS ====
app.get("/redis-test", async (req, res) => {
  try {
    await redis.set("hello", "world");
    const data = await redis.get("hello");
    res.json({ redis_test: data });
  } catch (err) {
    res.json({ error: err.message });
  }
});

// ==== START SERVER ====
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
