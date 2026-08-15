// Minimal dependency-free PNG encoder to generate PWA icons (sunrise motif).
"use strict";
const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

function crc32(buf) {
  let c, table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

function lerp(a, b, t) { return a + (b - a) * t; }
function hex(h) { const n = parseInt(h.replace("#", ""), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

function drawIcon(size, { maskableSafe }) {
  const rgba = Buffer.alloc(size * size * 4);

  const skyTop = hex("#FCEFDD");
  const skyMid = hex("#F3D3B4");
  const skyBot = hex("#EFC79E");
  const sunCore = hex("#FFE8BE");
  const sunMid = hex("#E3A65C");
  const sunEdge = hex("#C9793D");

  const cx = size * 0.5;
  const cy = size * (maskableSafe ? 0.56 : 0.5);
  const sunR = size * (maskableSafe ? 0.22 : 0.26);
  const horizonY = size * (maskableSafe ? 0.66 : 0.62);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      let r, g, b;
      // sky gradient background
      const t = y / size;
      if (t < 0.55) {
        const tt = t / 0.55;
        r = lerp(skyTop[0], skyMid[0], tt); g = lerp(skyTop[1], skyMid[1], tt); b = lerp(skyTop[2], skyMid[2], tt);
      } else {
        const tt = (t - 0.55) / 0.45;
        r = lerp(skyMid[0], skyBot[0], tt); g = lerp(skyMid[1], skyBot[1], tt); b = lerp(skyMid[2], skyBot[2], tt);
      }

      // sun disc
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < sunR) {
        const tt = dist / sunR;
        const near = Math.max(0, 1 - tt * 1.4);
        r = lerp(sunEdge[0], lerp(sunMid[0], sunCore[0], near), 0.001) ;
        // proper blend: core -> mid -> edge
        if (tt < 0.45) { const k = tt / 0.45; r = lerp(sunCore[0], sunMid[0], k); g = lerp(sunCore[1], sunMid[1], k); b = lerp(sunCore[2], sunMid[2], k); }
        else { const k = (tt - 0.45) / 0.55; r = lerp(sunMid[0], sunEdge[0], k); g = lerp(sunMid[1], sunEdge[1], k); b = lerp(sunMid[2], sunEdge[2], k); }
      }

      // soft horizon band (slightly darker, warm)
      if (y > horizonY && y < horizonY + Math.max(1, size * 0.012)) {
        r = lerp(r, 0x2B, 0.18); g = lerp(g, 0x24, 0.18); b = lerp(b, 0x20, 0.18);
      }

      rgba[i] = Math.round(Math.max(0, Math.min(255, r)));
      rgba[i + 1] = Math.round(Math.max(0, Math.min(255, g)));
      rgba[i + 2] = Math.round(Math.max(0, Math.min(255, b)));
      rgba[i + 3] = 255;
    }
  }
  return rgba;
}

function writeIcon(size, filename, opts) {
  const rgba = drawIcon(size, opts || {});
  const png = encodePNG(size, size, rgba);
  fs.writeFileSync(path.join(__dirname, "..", "public", "icons", filename), png);
  console.log("wrote", filename, png.length, "bytes");
}

writeIcon(192, "icon-192.png", { maskableSafe: false });
writeIcon(512, "icon-512.png", { maskableSafe: false });
writeIcon(512, "icon-maskable-512.png", { maskableSafe: true });
writeIcon(180, "apple-touch-icon.png", { maskableSafe: false });
