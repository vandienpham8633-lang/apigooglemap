import express from "express";
import fetch from "node-fetch";
import fs from "fs";

const app = express();
const PORT = process.env.PORT || 3000;

const CACHE_FILE = "./cache.json";
let cache = {};

// Đọc cache từ file (nếu hợp lệ)
if (fs.existsSync(CACHE_FILE)) {
  try {
    const content = fs.readFileSync(CACHE_FILE, "utf8").trim();
    cache = content ? JSON.parse(content) : {};
  } catch (e) {
    console.error("⚠️ Lỗi khi đọc cache.json:", e.message);
    cache = {};
  }
} else {
  fs.writeFileSync(CACHE_FILE, "{}"); // Tạo file mặc định
}

// Hàm lưu cache ra file
function saveCache() {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch (e) {
    console.error("⚠️ Lỗi khi lưu cache.json:", e.message);
  }
}

// Middleware giới hạn tốc độ: 1 request/giây
let lastRequest = 0;
async function callNominatim(lat, lon) {
  const now = Date.now();
  if (now - lastRequest < 1100) {
    await new Promise(r => setTimeout(r, 1100 - (now - lastRequest)));
  }
  lastRequest = Date.now();

  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=vi`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "MyApp/1.0 (your-email@example.com)" // Bắt buộc
    }
  });
  return res.json();
}

app.get("/", (req, res) => {
  res.send("OSM Proxy API is running. Try /address?lat=10.762622&lng=106.660172");
});

app.get("/address", async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: "Missing lat or lng" });

  const key = `${lat},${lng}`;
  if (cache[key]) {
    return res.json({ source: "cache", ...cache[key] });
  }

  try {
    const data = await callNominatim(lat, lng);
    const result = {
      display_name: data.display_name || null,
      address: data.address || null
    };
    cache[key] = result;
    saveCache();
    res.json({ source: "nominatim", ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
