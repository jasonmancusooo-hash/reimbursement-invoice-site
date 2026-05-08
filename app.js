import express from "express";
import ExcelJS from "exceljs";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const menusPath = path.join(__dirname, "data", "menus.json");
const invoicesPath = path.join(__dirname, "data", "invoices.json");
const exportTemplatePath = path.join(__dirname, "public", "templates", "invoice-template.xlsx");

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

function formatTemplateDate(dateStr) {
  if (!dateStr) return "";
  const [year, month, day] = dateStr.split("-");
  if (!year || !month || !day) return dateStr;
  return `${Number(day)}/${Number(month)}/${year}`;
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

app.post("/api/export-template", async (req, res) => {
  try {
    const payload = req.body || {};
    const items = Array.isArray(payload.items) ? payload.items : [];
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(exportTemplatePath);
    const sheet = workbook.worksheets[1];
    if (!sheet) {
      return res.status(400).json({ error: "模板第二工作表不存在" });
    }

    sheet.getCell("G4").value = `Date: ${formatTemplateDate(payload.invoiceDate || "")}`;

    for (let row = 17; row <= 33; row += 1) {
      sheet.getCell(`C${row}`).value = row - 16;
      sheet.getCell(`D${row}`).value = null;
      sheet.getCell(`E${row}`).value = null;
      sheet.getCell(`F${row}`).value = null;
      sheet.getCell(`G${row}`).value = null;
    }

    items.slice(0, 17).forEach((item, index) => {
      const row = 17 + index;
      sheet.getCell(`C${row}`).value = index + 1;
      sheet.getCell(`D${row}`).value = item.exportName || "";
      sheet.getCell(`E${row}`).value = Number(item.qty || 0);
      sheet.getCell(`F${row}`).value = Number(item.price || 0);
      sheet.getCell(`G${row}`).value = {
        formula: `E${row}*F${row}`
      };
    });

    sheet.getCell("G34").value = Number(payload.subtotal || 0);
    sheet.getCell("G35").value = null;
    sheet.getCell("G37").value = Number(payload.total || 0);

    const out = await workbook.xlsx.writeBuffer();
    const filename = `${payload.invoiceNo || "invoice"}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(Buffer.from(out));
  } catch (error) {
    res.status(500).json({ error: "导出模板失败", detail: String(error) });
  }
});

export default app;
