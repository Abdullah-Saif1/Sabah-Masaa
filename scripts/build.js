// Builds public/index.html from scripts/index.template.html by inlining the
// woff2 fonts in assets/fonts as base64 data URIs. Run after editing the
// template: `npm run build-html`.
"use strict";
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const templatePath = path.join(root, "scripts", "index.template.html");
const outPath = path.join(root, "public", "index.html");
const fontsDir = path.join(root, "assets", "fonts");

const FONT_MAP = {
  __AMIRI_400__: "amiri-400.woff2",
  __AMIRI_700__: "amiri-700.woff2",
  __LORA_400__: "lora-400.woff2",
  __LORA_ITALIC__: "lora-italic.woff2",
  __MANROPE__: "manrope.woff2",
};

let html = fs.readFileSync(templatePath, "utf8");

for (const [placeholder, filename] of Object.entries(FONT_MAP)) {
  const fontPath = path.join(fontsDir, filename);
  const b64 = fs.readFileSync(fontPath).toString("base64");
  if (!html.includes(placeholder)) {
    console.warn(`warning: placeholder ${placeholder} not found in template`);
    continue;
  }
  html = html.split(placeholder).join(b64);
}

fs.writeFileSync(outPath, html, "utf8");
console.log(`wrote ${outPath} (${(fs.statSync(outPath).size / 1024 / 1024).toFixed(2)} MB)`);
