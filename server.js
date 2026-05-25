// ═══════════════════════════════════════════════════
// MOCKUP STUDIO — Railway server
// ENV: FAL_API_KEY
// ═══════════════════════════════════════════════════
const express = require('express');
const cors    = require('cors');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { fal } = require('@fal-ai/client');
 
const app = express();
app.use(cors());
app.use(express.json({ limit: '30mb' }));
app.use(express.static('public'));
 
const FAL_KEY = process.env.FAL_API_KEY || '';
fal.config({ credentials: FAL_KEY });
 
console.log('Mockup Studio · FAL:', FAL_KEY ? FAL_KEY.substring(0,12)+'...' : 'MISSING ⚠');
 
// ── Multer upload ──────────────────────────────────
const storage = multer.diskStorage({
  destination: 'public/uploads/',
  filename: (_, f, cb) => cb(null, Date.now() + path.extname(f.originalname))
});
const upload = multer({ storage, limits: { fileSize: 30 * 1024 * 1024 } });
 
// ── Scene prompts ──────────────────────────────────
const SCENE_PROMPTS = {
  desk:      'a framed print of the product leaning against books on a clean luxury desk, beside a coffee cup and laptop, warm golden hour window light, soft bokeh, professional lifestyle photography, photorealistic, 8K',
  cafe:      'the product displayed as a large printed poster inside a warm cozy cafe, hung on exposed brick wall, ambient warm lighting, people in background blurred, lifestyle photography, photorealistic, 8K',
  studio:    'the product framed and displayed on an easel in a bright minimalist photography studio, white walls, soft diffused light from large windows, clean and professional, photorealistic, 8K',
  marble:    'the product lying flat on a luxury white marble surface, beside gold jewellery, a candle and a pen, editorial luxury flat lay photography, overhead shot, photorealistic, 8K',
  shelf:     'the product propped up on a wooden floating shelf on a white wall, surrounded by plants and minimal decor, lifestyle interior photography, natural light, photorealistic, 8K',
  office:    'the product framed large on a corporate office wall behind an executive desk, clean modern interior, dramatic directional lighting, photorealistic commercial photography, 8K',
  gallery:   'the product displayed as a large canvas print mounted on a white gallery wall, museum lighting, shadow beneath the frame, professional fine art photography, photorealistic, 8K',
  outdoor:   'the product displayed on a large outdoor billboard on a sunny city street, golden hour light, urban street scene, photorealistic advertising photography, 8K',
  bedroom:   'the product as a framed print on a bedroom wall above a styled bed, luxury interior, warm evening light, interior design photography, photorealistic, 8K',
  window:    'the product as a backlit poster display in a shop window at night, interior warm glow, city street reflection in glass, commercial retail photography, photorealistic, 8K',
  linen:     'the product printed card lying on cream linen fabric, beside fresh flowers and a coffee cup, soft natural light from left, luxury lifestyle flat lay, photorealistic, 8K',
  laptop:    'the product displayed on a laptop screen on a desk, open MacBook in a stylish home office setting, natural light, depth of field, lifestyle photography, photorealistic, 8K',
};
 
// ── Upload design ──────────────────────────────────
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const url = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  res.json({ url, filename: req.file.filename });
});
 
// ── Generate mockup ────────────────────────────────
app.post('/api/mockup', async (req, res) => {
  if (!FAL_KEY) return res.status(500).json({ error: 'FAL_API_KEY not set in Railway env vars' });
 
  const { imageUrl, scene, customPrompt, style = 'realistic' } = req.body;
  if (!imageUrl) return res.status(400).json({ error: 'No image URL provided' });
 
  const scenePrompt = customPrompt || SCENE_PROMPTS[scene] || SCENE_PROMPTS.window;
 
  // Prompt — preserve the source image, only change the environment around it
  const fullPrompt = `${scenePrompt}. Keep the exact original design/product/image unchanged. Only change the background scene and environment. The subject/design must remain identical to the input image. Professional commercial photography, photorealistic.`;
 
  console.log(`[mockup] scene=${scene} url=${imageUrl.substring(0,60)}`);
 
  // Endpoint cascade — product placement first, img2img fallback
  const ENDPOINTS = [
    {
      // BEST: Bria product-shot — purpose-built for placing YOUR image into a scene
      // Preserves your design exactly, changes only the background/environment
      id: 'fal-ai/bria/product-shot',
      build: () => ({
        image_url: imageUrl,
        scene_description: scenePrompt,
        num_results: 1,
        placement: 'original',
        shot_type: 'product'
      })
    },
    {
      // Fallback: img2img with LOW strength — preserves source image
      // 0.4 = 60% source image preserved, 40% scene influence
      id: 'fal-ai/flux/dev/image-to-image',
      build: () => ({
        image_url: imageUrl,
        prompt: fullPrompt,
        strength: 0.42,
        num_inference_steps: 28,
        guidance_scale: 5,
        negative_prompt: 'replace design, change text, different image, blurry, distorted, watermark, low quality'
      })
    },
    {
      // Last resort: flux schnell low strength
      id: 'fal-ai/flux/schnell/image-to-image',
      build: () => ({
        image_url: imageUrl,
        prompt: fullPrompt,
        strength: 0.38,
        num_inference_steps: 4
      })
    }
  ];
 
  let lastErr = '';
  for (const ep of ENDPOINTS) {
    try {
      console.log('[mockup] trying:', ep.id);
      const result = await fal.subscribe(ep.id, {
        input: ep.build(),
        logs: false,
        onQueueUpdate: (u) => console.log('[mockup]', ep.id, u.status)
      });
 
      const data = result.data || result;
      const outUrl = data.images?.[0]?.url
        || data.image?.url
        || data.image_url
        || data.output?.image_url
        || data.result?.[0]?.url;
 
      if (!outUrl) throw new Error('No image URL in response: ' + JSON.stringify(data).substring(0,200));
 
      console.log('[mockup] success:', outUrl.substring(0,80));
 
      // Download from FAL and save locally — prevents CDN expiry & CORS issues on frontend
      try {
        const dlRes = await fetch(outUrl);
        if (dlRes.ok) {
          const buf  = Buffer.from(await dlRes.arrayBuffer());
          const name = 'mockup-' + Date.now() + '.png';
          const localPath = path.join(__dirname, 'public', 'uploads', name);
          fs.writeFileSync(localPath, buf);
          const localUrl = req.protocol + '://' + req.get('host') + '/uploads/' + name;
          console.log('[mockup] saved locally:', localUrl);
          return res.json({ url: localUrl, endpoint: ep.id });
        }
      } catch (dlErr) {
        console.warn('[mockup] local save failed, returning FAL URL directly:', dlErr.message);
      }
 
      // Fallback: return FAL URL directly
      return res.json({ url: outUrl, endpoint: ep.id });
 
    } catch (e) {
      console.error('[mockup]', ep.id, 'failed:', e.message);
      lastErr = e.message;
    }
  }
 
  res.status(500).json({ error: 'All mockup endpoints failed. Last: ' + lastErr });
});
 
app.get('/health', (_, res) => res.json({ ok: true, fal: !!FAL_KEY }));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Mockup Studio on :${PORT}`));
 
