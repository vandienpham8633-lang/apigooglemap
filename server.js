import express from "express";
import fetch from "node-fetch";
import PQueue from "p-queue";

// ==== Config ====
const PORT = process.env.PORT || 10000;
const GITHUB_OWNER = "vandienpham8633"; // đổi thành user/org của bạn
const GITHUB_REPO = "apigooglemap";      // đổi thành repo chứa cache.json
const GITHUB_FILE = "cache.json";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN; // token lưu trong Render Dashboard
if (!GITHUB_TOKEN) throw new Error("⚠️ Missing GITHUB_TOKEN");

// ==== Express ====
const app = express();

// ==== Queue để tránh spam nominatim ====
const queue = new PQueue({ concurrency: 1, interval: 1000, intervalCap: 1 });

// ==== Cache RAM (sẽ sync với GitHub) ====
let cache = {};
let dirty = false; // cờ báo cần sync

// ==== Hàm tải cache từ GitHub ====
async function loadCache() {
  const url = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/main/${GITHUB_FILE}`;
  try {
    const res = await fetch(url);
    if (res.ok) {
      cache = await res.json();
      console.log("✅ Cache loaded from GitHub");
    } else {
      console.log("ℹ️ No cache file found, starting fresh.");
    }
  } catch (err) {
    console.error("⚠️ Failed to load cache:", err.message);
  }
}

// ==== Hàm push cache lên GitHub ====
async function saveCache() {
  if (!dirty) return;
  dirty = false;

  try {
    // 1. Lấy SHA hiện tại của file
    const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE}`;
    const headers = {
      Authorization: `token ${GITHUB_TOKEN}`,
      "Content-Type": "application/json",
    };

    let sha = null;
    let res = await fetch(apiUrl, { headers });
    if (res.ok) {
      const data = await res.json();
      sha = data.sha;
    }

    // 2. Commit file mới
    const content = Buffer.from(JSON.stringify(cache, null, 2)).toString("base64");
    res = await fetch(apiUrl, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        message: "Update cache.json",
        content,
        sha,
      }),
    });

    if (res.ok) {
      console.log("✅ Cache committed to GitHub");
    } else {
      console.error("⚠️ Failed to commit cache:", await res.text());
    }
  } catch (err) {
    console.error("⚠️ Error saving cache:", err.message);
  }
}

// Interval commit 5 phút 1 lần
setInterval(saveCache, 5 * 60 * 1000);

// ==== Hàm gọi nominatim ====
async function callNominatim(lat, lon) {
  return queue.add(async () => {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=vi`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "MyApp/1.0 (contact: youremail@example.com)", // đổi email thật
      },
    });
    if (!res.ok) throw new Error(`Nominatim error: ${res.status}`);
    return res.json();
  });
}

// ==== Routes ====
app.get("/", (req, res) => {
  res.send("✅ OSM Proxy with GitHub cache is running. Try /address?lat=10.762622&lng=106.660172");
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
      address: data.address || null,
    };

    cache[key] = result;
    dirty = true;

    res.json({ source: "nominatim", ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Debug xem toàn bộ cache RAM
app.get("/all-cache", (req, res) => {
  res.json(cache);
});

// ==== Start server ====
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  await loadCache();
});

