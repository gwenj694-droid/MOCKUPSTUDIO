// ═══════════════════════════════════════════════════
// PROMO STUDIO — Railway server
// 1. FAL generates lifestyle background scene
// 2. Server composites a phone mockup with user's design on screen
// ENV: FAL_API_KEY
// ═══════════════════════════════════════════════════
const express = require('express');
const cors    = require('cors');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const https   = require('https');
const http    = require('http');
const { createCanvas, loadImage } = require('canvas');
const { fal } = require('@fal-ai/client');
 
const app = express();
app.use(cors());
app.use(express.json({ limit: '30mb' }));
app.use(express.static('public'));
 
const FAL_KEY = process.env.FAL_API_KEY || '';
fal.config({ credentials: FAL_KEY });
console.log('Promo Studio · FAL:', FAL_KEY ? FAL_KEY.substring(0,14)+'...' : 'MISSING ⚠');
 
// ── Upload ──────────────────────────────────────────
const storage = multer.diskStorage({
  destination: 'public/uploads/',
  filename: (_, f, cb) => cb(null, Date.now() + path.extname(f.originalname))
});
const upload = multer({ storage, limits: { fileSize: 30*1024*1024 } });
 
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  res.json({ url: `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`, filename: req.file.filename });
});
 
// ── Scene backgrounds — lifestyle photography ───────
// These describe the SCENE WITHOUT the product — we add the phone ourselves
const SCENE_BACKGROUNDS = {
  car: {
    prompt: 'elegant confident woman in stylish outfit standing next to a sleek luxury black sports car, holding a blank white smartphone screen facing toward the camera, warm golden hour sunlight, professional fashion photography, cinematic, bokeh background, photorealistic, 8K',
    phone: { x:0.38, y:0.22, w:0.24, h:0.44 }, // phone position on 1:1 canvas
    format: { w:1080, h:1080 }
  },
  flatlay_bag: {
    prompt: 'luxury feminine flat lay, overhead shot, cream marble surface, designer handbag, gold keys, fresh pink roses, a blank white iPhone face-up showing empty white screen, gold jewellery, editorial photography, warm natural light, 4K',
    phone: { x:0.52, y:0.38, w:0.32, h:0.38 },
    format: { w:1080, h:1080 }
  },
  cafe_table: {
    prompt: 'stylish woman sitting at a luxury cafe table, holding a blank white smartphone screen facing camera, cappuccino and flowers on the table, warm ambient lighting, lifestyle photography, blurred background, 8K photorealistic',
    phone: { x:0.36, y:0.18, w:0.28, h:0.50 },
    format: { w:1080, h:1080 }
  },
  desk_flatlay: {
    prompt: 'overhead luxury desk flat lay, white marble surface, open designer notebook, gold pen, small succulent plant, blank white iPhone screen face-up, macbook keyboard partially visible, editorial photography, natural window light, 4K',
    phone: { x:0.55, y:0.40, w:0.28, h:0.36 },
    format: { w:1080, h:1080 }
  },
  woman_window: {
    prompt: 'confident elegant woman standing in front of large bright window, holding blank white smartphone screen toward camera, luxury minimal interior, white walls, natural diffused light, professional photography, 8K',
    phone: { x:0.36, y:0.20, w:0.28, h:0.50 },
    format: { w:1080, h:1080 }
  },
  story_model: {
    prompt: 'stylish female entrepreneur in modern office, looking at camera, holding blank white smartphone showing empty screen, confident pose, professional backdrop, editorial fashion photography, 9:16 portrait, 4K',
    phone: { x:0.36, y:0.22, w:0.28, h:0.46 },
    format: { w:1080, h:1920 }
  },
  story_lifestyle: {
    prompt: 'beautiful woman walking in luxury shopping district, holding blank white smartphone screen toward camera, golden hour sunlight, designer outfit, blurred city background, lifestyle fashion photography, 9:16 portrait, 8K',
    phone: { x:0.36, y:0.20, w:0.28, h:0.48 },
    format: { w:1080, h:1920 }
  },
  laptop_cafe: {
    prompt: 'stylish woman working at a bright cafe, open MacBook with blank white screen visible, coffee cup, flowers, warm ambient light, work from anywhere lifestyle photography, 8K photorealistic',
    phone: { x:0.25, y:0.25, w:0.50, h:0.38 }, // laptop screen
    format: { w:1080, h:1080 }
  },
  rooftop: {
    prompt: 'confident woman on luxury hotel rooftop terrace, city skyline behind, holding blank white smartphone toward camera, golden sunset light, editorial fashion photography, cinematic, 8K',
    phone: { x:0.37, y:0.22, w:0.26, h:0.46 },
    format: { w:1080, h:1080 }
  },
  minimal_studio: {
    prompt: 'minimal white studio photography setup, female model in elegant outfit, holding blank white smartphone screen facing camera, clean white background, dramatic side lighting, commercial photography, 8K',
    phone: { x:0.37, y:0.20, w:0.26, h:0.48 },
    format: { w:1080, h:1080 }
  },
  pool_villa: {
    prompt: 'luxury infinity pool villa, woman in elegant swimwear lounging, blank white smartphone on marble surface beside pool, tropical flowers, blue water, golden light, aspirational lifestyle photography, 8K',
    phone: { x:0.50, y:0.45, w:0.28, h:0.34 },
    format: { w:1080, h:1080 }
  },
  flowers_flatlay: {
    prompt: 'luxury flat lay overhead, soft pink and white peonies, cream linen fabric, blank white iPhone face-up, pearl jewellery, gold pen, editorial feminine photography, natural light, 4K',
    phone: { x:0.48, y:0.35, w:0.30, h:0.36 },
    format: { w:1080, h:1080 }
  },
};
 
// ── Draw phone mockup with design on screen ─────────
function drawPhoneMockup(ctx, designImg, px, py, pw, ph, isLaptop) {
  if (isLaptop) {
    // Laptop screen frame
    const r = 4;
    // Screen back
    const sg = ctx.createLinearGradient(px, py, px+pw, py+ph);
    sg.addColorStop(0, '#2a2a2a'); sg.addColorStop(1, '#1a1a1a');
    ctx.fillStyle = sg;
    roundRectFill(ctx, px, py, pw, ph, r);
    // Screen bezel
    const bx=px+8, by=py+6, bw=pw-16, bh=ph-12;
    ctx.fillStyle = '#050508';
    roundRectFill(ctx, bx, by, bw, bh, 3);
    // Design
    ctx.save();
    roundRectClip(ctx, bx, by, bw, bh, 3);
    ctx.drawImage(designImg, bx, by, bw, bh);
    // glare
    const gl = ctx.createLinearGradient(bx, by, bx+bw*0.5, by+bh*0.4);
    gl.addColorStop(0,'rgba(255,255,255,0.06)'); gl.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=gl; ctx.fillRect(bx,by,bw,bh);
    ctx.restore();
    // Base
    ctx.fillStyle = '#222'; roundRectFill(ctx, px-12, py+ph, pw+24, 10, 0,0,4,4);
    return;
  }
 
  // Phone frame
  const r = Math.round(pw * 0.12);
  // Shadow
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.65)'; ctx.shadowBlur = 28; ctx.shadowOffsetX = 4; ctx.shadowOffsetY = 10;
  const bodyG = ctx.createLinearGradient(px, py, px+pw, py+ph);
  bodyG.addColorStop(0, '#3a3a3a'); bodyG.addColorStop(0.4, '#242424'); bodyG.addColorStop(1, '#1a1a1a');
  ctx.fillStyle = bodyG; roundRectFill(ctx, px, py, pw, ph, r); ctx.fill();
  ctx.restore();
  // Body
  const bodyG2 = ctx.createLinearGradient(px, py, px+pw, py+ph);
  bodyG2.addColorStop(0, '#3a3a3a'); bodyG2.addColorStop(0.4, '#242424'); bodyG2.addColorStop(1, '#1a1a1a');
  ctx.fillStyle = bodyG2; roundRectFill(ctx, px, py, pw, ph, r); ctx.fill();
  // Edge glint
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1.5; roundRectPath(ctx, px, py, pw, ph, r); ctx.stroke();
  // Screen area
  const sx = px+5, sy = py+10, sw = pw-10, sh = ph-20, sr = r-4;
  ctx.fillStyle = '#020209'; roundRectFill(ctx, sx, sy, sw, sh, sr); ctx.fill();
  // Design on screen
  ctx.save(); roundRectClip(ctx, sx, sy, sw, sh, sr);
  ctx.drawImage(designImg, sx, sy, sw, sh);
  // Screen glare
  const glare = ctx.createLinearGradient(sx, sy, sx+sw*0.6, sy+sh*0.45);
  glare.addColorStop(0,'rgba(255,255,255,0.09)'); glare.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle = glare; ctx.fillRect(sx, sy, sw, sh);
  ctx.restore();
  // Notch/Dynamic Island
  ctx.fillStyle = '#020209';
  roundRectFill(ctx, px+pw/2-pw*0.18, sy+4, pw*0.36, ph*0.034, ph*0.016); ctx.fill();
  // Home bar
  const hbG = ctx.createLinearGradient(px+pw/2-pw*0.22, 0, px+pw/2+pw*0.22, 0);
  hbG.addColorStop(0,'rgba(255,255,255,0)'); hbG.addColorStop(0.5,'rgba(255,255,255,0.25)'); hbG.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle = hbG; roundRectFill(ctx, px+pw/2-pw*0.22, py+ph-ph*0.028, pw*0.44, ph*0.014, ph*0.007); ctx.fill();
}
 
// Canvas helpers
function roundRectFill(ctx, x, y, w, h, tl, tr, br, bl) {
  roundRectPath(ctx, x, y, w, h, tl, tr, br, bl); ctx.fill();
}
function roundRectClip(ctx, x, y, w, h, r) {
  roundRectPath(ctx, x, y, w, h, r); ctx.clip();
}
function roundRectPath(ctx, x, y, w, h, tl, tr, br, bl) {
  const r = typeof tl === 'number' ? tl : 6;
  tr = tr||r; br = br||r; bl = bl||r;
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.lineTo(x+w-tr, y); ctx.arcTo(x+w, y, x+w, y+tr, tr);
  ctx.lineTo(x+w, y+h-br); ctx.arcTo(x+w, y+h, x+w-br, y+h, br);
  ctx.lineTo(x+bl, y+h); ctx.arcTo(x, y+h, x, y+h-bl, bl);
  ctx.lineTo(x, y+r); ctx.arcTo(x, y, x+r, y, r);
  ctx.closePath();
}
 
// Fetch helper
function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}
 
// ── GENERATE ───────────────────────────────────────
app.post('/api/mockup', async (req, res) => {
  if (!FAL_KEY) return res.status(500).json({ error: 'FAL_API_KEY not set in Railway env vars' });
 
  const { imageUrl, scene, customPrompt, headline='', subtext='', cta='' } = req.body;
  if (!imageUrl) return res.status(400).json({ error: 'No image URL' });
 
  const sceneConfig = SCENE_BACKGROUNDS[scene] || SCENE_BACKGROUNDS.car;
  const bgPrompt = customPrompt || sceneConfig.prompt;
  const phonePos = sceneConfig.phone;
  const fmt = sceneConfig.format;
  const isLaptop = scene === 'laptop_cafe';
 
  console.log(`[promo] scene=${scene} fmt=${fmt.w}x${fmt.h} generating BG…`);
 
  try {
    // Step 1: Generate background with FAL text2image
    const bgResult = await fal.subscribe('fal-ai/flux/dev', {
      input: {
        prompt: bgPrompt,
        image_size: { width: fmt.w, height: fmt.h },
        num_inference_steps: 25,
        guidance_scale: 3.5,
        num_images: 1,
      },
      logs: false
    });
 
    const bgUrl = bgResult.data?.images?.[0]?.url || bgResult.data?.image?.url;
    if (!bgUrl) throw new Error('Background generation failed — no image returned');
    console.log(`[promo] BG ready: ${bgUrl.substring(0,60)}`);
 
    // Step 2: Load images
    const bgBuf = await fetchBuffer(bgUrl);
    const bgImg  = await loadImage(bgBuf);
 
    // Load design from disk (fastest, no CORS)
    const designFilename = imageUrl.split('/uploads/').pop().split('?')[0];
    const designDiskPath = path.join(__dirname, 'public/uploads', designFilename);
    const designImg = fs.existsSync(designDiskPath)
      ? await loadImage(designDiskPath)
      : await loadImage(await fetchBuffer(imageUrl));
    console.log('[promo] design loaded');
 
    // Step 3: Composite
    const W = bgImg.width  || fmt.w;
    const H = bgImg.height || fmt.h;
    const canvas = createCanvas(W, H);
    const ctx    = canvas.getContext('2d');
 
    // Draw background
    ctx.drawImage(bgImg, 0, 0, W, H);
 
    // Calculate phone position from relative coords
    const px = Math.round(phonePos.x * W);
    const py = Math.round(phonePos.y * H);
    const pw = Math.round(phonePos.w * W);
    const ph = Math.round(phonePos.h * H);
 
    // Draw phone mockup with design on screen
    drawPhoneMockup(ctx, designImg, px, py, pw, ph, isLaptop);
 
    // Step 4: Text overlay
    if (headline || subtext || cta) {
      const bandH = Math.round(H * 0.26);
      const band = ctx.createLinearGradient(0, H - bandH, 0, H);
      band.addColorStop(0, 'rgba(0,0,0,0)');
      band.addColorStop(0.35, 'rgba(0,0,0,0.7)');
      band.addColorStop(1, 'rgba(0,0,0,0.88)');
      ctx.fillStyle = band; ctx.fillRect(0, H - bandH, W, bandH);
 
      const pad = Math.round(W * 0.07);
      let ty = H - bandH + Math.round(bandH * 0.2);
 
      if (headline) {
        const fs1 = Math.round(W * 0.062);
        ctx.font = `bold ${fs1}px Arial, sans-serif`;
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 8;
        const words = headline.split(' '), maxW = W - pad*2;
        let line = '', lines = [];
        words.forEach(w => { const t = line ? line+' '+w : w; if(ctx.measureText(t).width>maxW && line){lines.push(line);line=w;}else line=t; });
        if(line) lines.push(line);
        lines.forEach(l => { ctx.fillText(l, pad, ty); ty += Math.round(fs1*1.28); });
        ctx.shadowBlur = 0; ty += Math.round(W*0.01);
      }
      if (subtext) {
        const fs2 = Math.round(W * 0.036);
        ctx.font = `${fs2}px Arial, sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,0.78)';
        ctx.fillText(subtext, pad, ty); ty += Math.round(fs2*1.6);
      }
      if (cta) {
        const fs3 = Math.round(W * 0.032);
        ctx.font = `bold ${fs3}px Arial, sans-serif`;
        ctx.fillStyle = '#E8B84B';
        ctx.fillText('→ ' + cta, pad, ty);
      }
    }
 
    // Save
    const outName = `promo-${Date.now()}.jpg`;
    const outPath = path.join(__dirname, 'public/uploads', outName);
    fs.writeFileSync(outPath, canvas.toBuffer('image/jpeg', { quality: 0.93 }));
 
    const finalUrl = `${req.protocol}://${req.get('host')}/uploads/${outName}`;
    console.log('[promo] done:', finalUrl);
    res.json({ url: finalUrl });
 
  } catch(e) {
    console.error('[promo] ERROR:', e.message);
    res.status(500).json({ error: e.message });
  }
});
 
app.get('/health', (_, res) => res.json({ ok: true, fal: !!FAL_KEY }));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Promo Studio on :${PORT}`));
 
