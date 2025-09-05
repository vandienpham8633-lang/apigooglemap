import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

async function getAddress(lat, lng) {
  const url = `https://www.google.com/maps/place/${lat},${lng}`;
  const res = await fetch(url);
  const html = await res.text();

  const plusMatch = html.match(/"compound_code":"([^"]+)"/);
  const plusCode = plusMatch ? plusMatch[1] : null;

  const addrMatch = html.match(/"formatted_address":"([^"]+)"/);
  const formattedAddress = addrMatch ? addrMatch[1] : null;

  return { plusCode, formattedAddress };
}

app.get("/address", async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) {
    return res.status(400).json({ error: "Missing lat or lng" });
  }
  try {
    const result = await getAddress(lat, lng);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
app.get("/", (req, res) => {
  res.send("Google Maps Address API is running. Try /address?lat=10.762622&lng=106.660172");
});


