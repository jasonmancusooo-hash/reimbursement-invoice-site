import express from "express";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const menusPath = path.join(__dirname, "data", "menus.json");
const invoicesPath = path.join(__dirname, "data", "invoices.json");

const app = express();

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

async function readJson(filePath, fallback) {
  try {
    const text = await fs.readFile(filePath, "utf8");
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, now: new Date().toISOString() });
});

app.get("/api/restaurants", async (_req, res) => {
  const menus = await readJson(menusPath, {});
  res.json(menus);
});

app.get("/api/invoices", async (_req, res) => {
  const invoices = await readJson(invoicesPath, []);
  res.json(invoices.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

app.post("/api/invoices", async (req, res) => {
  const payload = req.body || {};
  if (!payload.invoiceNo || !Array.isArray(payload.items) || payload.items.length === 0) {
    return res.status(400).json({ error: "缺少必要发票数据" });
  }

  const invoices = await readJson(invoicesPath, []);
  const record = {
    id: `inv_${Date.now()}`,
    createdAt: new Date().toISOString(),
    ...payload
  };

  invoices.push(record);
  await writeJson(invoicesPath, invoices);
  return res.status(201).json(record);
});

app.delete("/api/invoices/:id", async (req, res) => {
  const { id } = req.params;
  const invoices = await readJson(invoicesPath, []);
  const next = invoices.filter((invoice) => invoice.id !== id);
  await writeJson(invoicesPath, next);
  res.json({ ok: true });
});

export default app;
