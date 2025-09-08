import express from "express";
import fetch from "node-fetch";
import { encode } from "open-location-code";
import PQueue from "p-queue";

const app = express();
const PORT = process.env.PORT || 10000;

// Queue tránh spam Google
const queue = new PQueue({ concurrency: 1, interval: 1000, intervalCap: 1 });

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

  try {
    const globalCode = encode(Number(lat), Number(lng));
    const html = await fetchGoogleSource(globalCode);
    const compoundCode = extractCompoundCode(html, globalCode);

    res.json({
      lat,
      lng,
      plus_code: {
        global: globalCode,
        compound: compoundCode
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==== Start server ====
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
