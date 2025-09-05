import express from "express";
import puppeteer from "puppeteer";

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Google Maps Scraper API is running. Try /address?lat=10.762622&lng=106.660172");
});

app.get("/address", async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: "Missing lat or lng" });

  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });
    const page = await browser.newPage();
    await page.goto(`https://www.google.com/maps/place/${lat},${lng}`, {
      waitUntil: "networkidle2",
      timeout: 30000
    });

    const html = await page.content();
    await browser.close();

    const plusMatch = html.match(/"compound_code":"([^"]+)"/);
    const addrMatch = html.match(/"formatted_address":"([^"]+)"/);

    res.json({
      plusCode: plusMatch ? plusMatch[1] : null,
      formattedAddress: addrMatch ? addrMatch[1] : null
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
