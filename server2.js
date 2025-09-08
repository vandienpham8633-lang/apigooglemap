import express from "express";
import fetch from "node-fetch";
import PQueue from "p-queue";
import { encode } from "open-location-code";

const app = express();
const PORT = process.env.PORT || 10000;

const queue = new PQueue({ concurrency: 1, interval: 1000, intervalCap: 1 });

// Hàm gọi nominatim
async function callNominatim(lat, lon) {
  return queue.add(async () => {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=vi`;
    const res = await fetch(url, {
      headers: { "User-Agent": "MyApp/1.0 (contact: youremail@example.com)" }
    });
    if (!res.ok) throw new Error(`Nominatim error: ${res.status}`);
    return res.json();
  });
}

// Hàm fetch Google Maps view-source
async function fetchGoogleSource(globalCode) {
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(globalCode)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" }
  });
  return res.text();
}

// Hàm parse compound code
function extractCompoundCode(html, globalCode) {
  const regex = new RegExp(`${globalCode}[^"]*?\\[\\\\\\"(.*?)\\\\\\"\\]`, "s");
  const match = html.match(regex);
  return match ? match[1] : null;
}

// Route chính
app.get("/address", async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: "Missing lat or lng" });

  try {
    // gọi nominatim
    const data = await callNominatim(lat, lng);

    // encode plus code
    const globalCode = encode(Number(lat), Number(lng));
    const html = await fetchGoogleSource(globalCode);
    const compoundCode = extractCompoundCode(html, globalCode);

    res.json({
      display_name: data.display_name || null,
      address: data.address || null,
      plus_code: {
        global: globalCode,
        compound: compoundCode
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
