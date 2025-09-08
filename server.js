import express from "express";
import fetch from "node-fetch";
import PQueue from "p-queue";
// thay vì: import olc from "open-location-code"; const { encode } = olc;
import pkg from "open-location-code";
const { OpenLocationCode } = pkg;
const olc = new OpenLocationCode();


// ==== Config ====
const PORT = process.env.PORT || 10000;
const GITHUB_OWNER = "vandienpham8633-lang"; // đổi thành user/org của bạn
const GITHUB_REPO = "apigooglemap";          // repo chứa cache.json
const GITHUB_FILE = "cache.json";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN; // token lưu trong Render
if (!GITHUB_TOKEN) throw new Error("⚠️ Missing GITHUB_TOKEN");

// ==== Express ====
const app = express();

// ==== Queue để tránh spam ====
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

// Interval commit 5 phút 1 lần
setInterval(saveCache, 5 * 60 * 1000);

// ==== Hàm fetch thông tin Plus Code từ Google Maps ====
// parse ra địa chỉ ngắn gọn từ page source
async function fetchGooglePlusCodeName(globalCode, lat, lng) {
  const url = `https://www.google.com/maps/place/${lat},${lng}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google Maps fetch failed: ${res.status}`);

  const html = await res.text();

  const regex = new RegExp(`${globalCode}.*?\\[\\s*"(.*?)"\\s*\\]`);
  const match = html.match(regex);

  if (match && match[1]) {
    return match[1]; // ví dụ: WP9P+V4F Thuan An, Binh Duong
  }

  return null;
}

// ==== Routes ====
app.get("/", (req, res) => {
  res.send("✅ Google Plus Code Proxy with GitHub cache is running. Try /address?lat=10.9197&lng=106.7353");
});

app.get("/address", async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: "Missing lat or lng" });

  const key = `${lat},${lng}`;
  if (cache[key]) {
    return res.json({ source: "cache", ...cache[key] });
  }

  try {
    const globalCode = olc.encode(Number(lat), Number(lng));
    const plusCodeName = await fetchGooglePlusCodeName(globalCode, lat, lng);

    const result = {
      global_code: globalCode,
      plus_code_name: plusCodeName,
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
