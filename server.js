import express from "express";
import fetch from "node-fetch";
import { encode } from "open-location-code";
import PQueue from "p-queue";

// ==== Config ====
const PORT = process.env.PORT || 10000;
const GITHUB_OWNER = "vandienpham8633-lang"; // đổi thành user/org của bạn
const GITHUB_REPO = "apigooglemap";          // đổi thành repo chứa cache.json
const GITHUB_FILE = "cache.json";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN; // token lưu trong Render Dashboard
if (!GITHUB_TOKEN) throw new Error("⚠️ Missing GITHUB_TOKEN");

// ==== Express ====
const app = express();

// ==== Queue để tránh spam Google ====
const queue = new PQueue({ concurrency: 1, interval: 2000, intervalCap: 1 });

// ==== Cache RAM (sync với GitHub) ====
let cache = {};
let dirty = false;

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
setInterval(saveCache, 5 * 60 * 1000); // commit mỗi 5 phút

// ==== Hàm fetch Google Maps view-source ====
async function fetchGoogleSource(globalCode) {
  return queue.add(async () => {
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(globalCode)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
    });
    return res.text();
  });
}

// ==== Hàm parse compound code từ source ====
function extractCompoundCode(html, globalCode) {
  const regex = new RegExp(`${globalCode}[^"]*?\\[\\\\\\"(.*?)\\\\\\"\\]`, "s");
  const match = html.match(regex);
  return match ? match[1] : null;
}

// ==== Route chính ====
app.get("/address", async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: "Missing lat or lng" });

  const key = `${lat},${lng}`;

  if (cache[key]) {
    return res.json({ source: "cache", ...cache[key] });
  }

  try {
    const globalCode = encode(Number(lat), Number(lng));
    const html = await fetchGoogleSource(globalCode);
    const compoundCode = extractCompoundCode(html, globalCode);

    const result = {
      lat,
      lng,
      plus_code: {
        global: globalCode,
        compound: compoundCode
      }
    };

    cache[key] = result;
    dirty = true;

    res.json({ source: "google", ...result });
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
