import express from "express";
import fetch from "node-fetch";
import PQueue from "p-queue";
import compression from "compression";
import { Redis } from "@upstash/redis";

// ==== CONFIG ====
const PORT = process.env.PORT || 10000;

const redis = new Redis({
  url: process.env.REDIS_URL,
  token: process.env.REDIS_TOKEN
});

// ==== RAM CACHE (Layer 1 – giảm 90–99% Redis GET) ====
const memoryCache = {};
const MEMORY_TTL = 24 * 60 * 60 * 1000; // RAM lưu 24 giờ

const memorySet = (key, data) => {
  memoryCache[key] = {
    data,
    expires: Date.now() + MEMORY_TTL
  };
};

const memoryGet = (key) => {
  const item = memoryCache[key];
  if (!item) return null;
  if (Date.now() > item.expires) {
    delete memoryCache[key];
    return null;
  }
  return item.data;
};

// ==== Express ====
const app = express();
app.use(compression());

// ==== Queue 1 request/s chuẩn Nominatim ====
const queue = new PQueue({ concurrency: 1, interval: 1000, intervalCap: 1 });

// ==== Gọi Nominatim ====
async function callNominatim(lat, lon) {
  return queue.add(async () => {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=vi`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Bao-OSM-Proxy/1.0 (contact: baobao@gmail.com)"
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
  res.send("🚀 Bao OSM Reverse API running • /address?lat=10.7&lng=106.6");
});

// ==== API LẤY ĐỊA CHỈ ====
app.get("/address", async (req, res) => {
  const { lat, lng } = req.query;

  if (!lat || !lng)
    return res.status(400).json({ error: "Missing lat or lng" });

  const key = `${lat},${lng}`;

  // 🔥 1) CHECK RAM CACHE (0 request Redis)
  const ram = memoryGet(key);
  if (ram) {
    return res.json({ source: "ram", ...ram });
  }

  // 🔥 2) CHECK REDIS (Layer 2)
  const cached = await redis.get(key);
  if (cached) {
    memorySet(key, cached); // đẩy lên RAM
    return res.json({ source: "redis", ...cached });
  }

  // 🔥 3) GỌI NOMINATIM (Layer 3)
  try {
    const data = await callNominatim(lat, lng);

    const result = {
      display_name: data.display_name || "",
      address: data.address || {}
    };

    memorySet(key, result); // → RAM
    await redis.set(key, result, { ex: 15552000 }); // → Redis, TTL 180 ngày

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
  console.log(`🚀 Bao OSM API running on port ${PORT}`);
});
