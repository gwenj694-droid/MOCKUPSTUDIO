// ═══════════════════════════════════════════════════
// MOCKUP STUDIO — Railway server
// ENV: FAL_API_KEY
// Approach: generate photorealistic BG → composite design onto it
// ═══════════════════════════════════════════════════
const express = require('express');
const cors    = require('cors');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const https   = require('https');
const http    = require('http');
const { createCanvas, loadImage } = require('canvas');
const { URL: NodeURL } = require('url');
const { fal } = require('@fal-ai/client');
 
const app = express();
app.use(cors());
app.use(express.json({ limit: '30mb' }));
app.use(express.static('public'));
 
const FAL_KEY = process.env.FAL_API_KEY || '';
fal.config({ credentials: FAL_KEY });
console.log('Mockup Studio · FAL:', FAL_KEY ? FAL_KEY.substring(0,14)+'...' : 'MISSING ⚠');
 
// ── Upload ─────────────────────────────────────────
const storage = multer.diskStorage({
  destination: 'public/uploads/',
  filename: (_, f, cb) => cb(null, Date.now() + path.extname(f.originalname))
});
const upload = multer({ storage, limits: { fileSize: 30*1024*1024 } });
 
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  res.json({ url: `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`, filename: req.file.filename });
});
 
// ── Scene background prompts (no design — just the scene) ──
const BG_PROMPTS = {
  desk:     'luxury minimalist home office desk, empty clean surface, stack of books to one side, white ceramic coffee cup, warm golden hour window light, soft bokeh background, professional lifestyle photography, no people, 4K',
  cafe:     'warm cozy cafe interior, exposed brick wall with empty blank white frames, ambient warm lighting, blurred coffee cups and people in background, professional interior photography, 4K',
  studio:   'bright white photography studio, large windows letting in natural light, wooden easel with blank white canvas board, clean minimalist setting, professional photography, 4K',
  marble:   'luxury white marble surface flat lay, fresh flowers at edge, gold pen, small candle, blank white card area in centre, overhead shot, editorial photography, natural light, 4K',
  shelf:    'wooden floating shelf on white wall, small potted green plants beside an empty picture frame, minimal Scandinavian interior, soft natural light, interior design photography, 4K',
  office:   'modern corporate office, clean executive desk in foreground, large blank white framed canvas on wall behind, dramatic directional lighting, professional commercial photography, 4K',
  gallery:  'pristine white gallery walls, museum directional spotlights, empty large white picture frame on wall, polished concrete floor, fine art photography, 4K',
  outdoor:  'busy city street at dusk, large outdoor billboard structure with blank white face, golden hour street lighting, urban background, advertising photography, 4K',
  bedroom:  'luxury bedroom interior, styled bed with linen pillows, blank white picture frame on dark wall above headboard, warm evening ambient lighting, interior design photography, 4K',
  window:   'luxury retail shop window at night, illuminated display case with blank white backing, city street reflection in glass, commercial retail photography, 4K',
  linen:    'cream linen fabric surface flat lay, small fresh flowers at corner, blank white card space in centre, soft natural side light, editorial lifestyle photography, 4K',
  laptop:   'open MacBook laptop on wooden desk, blank white screen, coffee cup beside it, minimalist home office, natural window light, lifestyle photography, 4K',
};
 
// ── Composite positions per scene (x%, y%, w%, h% of output image) ──
// Where to paste the design onto the generated background
const COMPOSITE_POS = {
  desk:    { x:0.32, y:0.38, w:0.34, h:0.50, angle: 0  },
  cafe:    { x:0.30, y:0.15, w:0.38, h:0.60, angle: 0  },
  studio:  { x:0.30, y:0.12, w:0.40, h:0.72, angle: 0  },
  marble:  { x:0.25, y:0.20, w:0.50, h:0.60, angle:-4  },
  shelf:   { x:0.28, y:0.10, w:0.44, h:0.65, angle: 0  },
  office:  { x:0.28, y:0.08, w:0.44, h:0.60, angle: 0  },
  gallery: { x:0.22, y:0.12, w:0.56, h:0.72, angle: 0  },
  outdoor: { x:0.30, y:0.10, w:0.40, h:0.48, angle: 0  },
  bedroom: { x:0.28, y:0.10, w:0.44, h:0.55, angle: 0  },
  window:  { x:0.25, y:0.15, w:0.50, h:0.68, angle: 0  },
  linen:   { x:0.22, y:0.22, w:0.56, h:0.56, angle:-3  },
  laptop:  { x:0.28, y:0.12, w:0.44, h:0.52, angle: 0  },
};
 
// ── Fetch helper ─────────────────────────────────
function fetchBuffer(url){
  return new Promise((resolve, reject)=>{
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, res=>{
      const chunks=[];
      res.on('data', c=>chunks.push(c));
      res.on('end', ()=>resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}
 
// ── Generate mockup ───────────────────────────────
app.post('/api/mockup', async (req, res) => {
  if (!FAL_KEY) return res.status(500).json({ error: 'FAL_API_KEY not set' });
  const { imageUrl, scene, customPrompt, format='square', headline='', subtext='', cta='' } = req.body;
 
  // Output dimensions by format
  const FORMATS = {
    square:  { w:1080, h:1080 },
    portrait:{ w:1080, h:1350 },
    story:   { w:1080, h:1920 },
  };
  const fmt = FORMATS[format] || FORMATS.square;
  if (!imageUrl) return res.status(400).json({ error: 'No image URL' });
 
  const bgPrompt = customPrompt || BG_PROMPTS[scene] || BG_PROMPTS.desk;
  const pos = COMPOSITE_POS[scene] || COMPOSITE_POS.desk;
  const outName = `mockup-${Date.now()}.jpg`;
  const outPath = path.join(__dirname, 'public/uploads', outName);
 
  console.log(`[mockup] scene=${scene} generating background…`);
 
  try {
    // Step 1: Generate photorealistic background with FAL text2image
    const bgResult = await fal.subscribe('fal-ai/flux/schnell', {
      input: {
        prompt: bgPrompt,
        image_size: { width: fmt.w, height: fmt.h },
        num_inference_steps: 4,
        num_images: 1,
      },
      logs: false
    });
 
    const bgUrl = bgResult.data?.images?.[0]?.url || bgResult.data?.image?.url;
    if (!bgUrl) throw new Error('Background generation failed');
    console.log(`[mockup] bg generated: ${bgUrl.substring(0,60)}`);
 
    // Step 2: Download background from FAL
    const bgBuf = await fetchBuffer(bgUrl);
 
    // Step 3: Load background; load design from disk or URL
    const bgImg = await loadImage(bgBuf);
 
    // Design: extract filename from URL and read from disk
    let designImg;
    try {
      const designFilename = imageUrl.split('/uploads/').pop().split('?')[0];
      const designDiskPath = path.join(__dirname, 'public/uploads', designFilename);
      if (fs.existsSync(designDiskPath)) {
        designImg = await loadImage(designDiskPath);
        console.log('[mockup] design loaded from disk:', designDiskPath);
      } else {
        const designBuf = await fetchBuffer(imageUrl);
        designImg = await loadImage(designBuf);
        console.log('[mockup] design loaded from URL');
      }
    } catch(imgErr) {
      console.error('[mockup] design load error:', imgErr.message);
      throw new Error('Could not load your design image: ' + imgErr.message);
    }
 
    const W = bgImg.width  || fmt.w;
    const H = bgImg.height || fmt.h;
 
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');
 
    // Draw background
    ctx.drawImage(bgImg, 0, 0, W, H);
 
    // Calculate design position
    const dx = pos.x * W;
    const dy = pos.y * H;
    const dw = pos.w * W;
    const dh = pos.h * H;
    const cx = dx + dw/2;
    const cy = dy + dh/2;
 
    // Draw design with subtle shadow and slight angle
    ctx.save();
    ctx.translate(cx, cy);
    if (pos.angle) ctx.rotate(pos.angle * Math.PI / 180);
 
    // Drop shadow
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur  = 28;
    ctx.shadowOffsetX = 6;
    ctx.shadowOffsetY = 10;
 
    ctx.drawImage(designImg, -dw/2, -dh/2, dw, dh);
 
    // Remove shadow for glare layer
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur  = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
 
    // Subtle glare overlay
    const glare = ctx.createLinearGradient(-dw/2, -dh/2, dw*0.1, dh*0.2);
    glare.addColorStop(0, 'rgba(255,255,255,0.07)');
    glare.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glare;
    ctx.fillRect(-dw/2, -dh/2, dw, dh);
 
    ctx.restore();
 
    // Text overlay
    if (headline || subtext || cta) {
      // Bottom gradient band
      const bandH = Math.round(H * 0.28);
      const band = ctx.createLinearGradient(0, H - bandH, 0, H);
      band.addColorStop(0, 'rgba(0,0,0,0)');
      band.addColorStop(0.4, 'rgba(0,0,0,0.72)');
      band.addColorStop(1, 'rgba(0,0,0,0.88)');
      ctx.fillStyle = band;
      ctx.fillRect(0, H - bandH, W, bandH);
 
      const pad = Math.round(W * 0.07);
      let ty = H - bandH + Math.round(bandH * 0.22);
 
      if (headline) {
        const fsize = Math.round(W * 0.065);
        ctx.font = `700 ${fsize}px "DM Sans", Arial, sans-serif`;
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 8;
        // Word wrap
        const words = headline.split(' ');
        const maxW = W - pad * 2;
        let line = '';
        const lines = [];
        words.forEach(function(w) {
          const test = line ? line + ' ' + w : w;
          if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
          else line = test;
        });
        if (line) lines.push(line);
        lines.forEach(function(l) {
          ctx.fillText(l, pad, ty);
          ty += Math.round(fsize * 1.25);
        });
        ctx.shadowBlur = 0;
        ty += Math.round(W * 0.012);
      }
 
      if (subtext) {
        const fsize2 = Math.round(W * 0.038);
        ctx.font = `300 ${fsize2}px "DM Sans", Arial, sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fillText(subtext, pad, ty);
        ty += Math.round(fsize2 * 1.6);
      }
 
      if (cta) {
        const fsize3 = Math.round(W * 0.034);
        ctx.font = `600 ${fsize3}px "DM Sans", Arial, sans-serif`;
        ctx.fillStyle = '#E8B84B';
        ctx.fillText('→ ' + cta, pad, ty);
      }
    }
 
    // Save as JPEG
    const buf = canvas.toBuffer('image/jpeg', { quality: 0.92 });
    fs.writeFileSync(outPath, buf);
 
    const finalUrl = `${req.protocol}://${req.get('host')}/uploads/${outName}`;
    console.log(`[mockup] done: ${finalUrl}`);
    res.json({ url: finalUrl });
 
  } catch(e) {
    console.error('[mockup] ERROR:', e.message);
    res.status(500).json({ error: e.message });
  }
});
 
app.get('/health', (_, res) => res.json({ ok: true, fal: !!FAL_KEY }));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Mockup Studio on :${PORT}`));
 
