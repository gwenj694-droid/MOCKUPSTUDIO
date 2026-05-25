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
  window:    'product placed inside a large illuminated retail lightbox display mounted in a luxury shopping mall window. warm interior lighting, professional retail environment, photorealistic commercial photography',
  phone:     'product displayed on iPhone screen filling the entire screen edge to edge, hand holding phone naturally, soft bokeh background, lifestyle photography, photorealistic',
  laptop:    'product displayed fullscreen on MacBook laptop screen filling entire display, laptop open on wooden desk with coffee, professional workspace, photorealistic photography',
  billboard: 'product displayed on large outdoor city billboard filling the entire billboard face edge to edge, golden hour urban street, photorealistic advertising photography',
  book:      'product displayed as full book cover filling the entire cover without cropping, hardback book on marble surface, editorial flat lay photography, photorealistic',
  poster:    'product displayed as large framed wall print filling the entire frame, hung on white gallery wall, soft directional museum lighting, photorealistic interior photography',
  shirt:     'product design printed large on the front chest area of a clean white t-shirt, person wearing it outdoors, lifestyle photography, photorealistic clothing mockup',
  mural:     'product painted as a large street mural filling the entire brick wall face, urban environment, wide angle photography, photorealistic street art mockup',
  magazine:  'product displayed as a full glossy magazine cover or full page spread, magazine on marble surface, editorial flat lay, photorealistic publishing mockup',
  car:       'product applied as vinyl decal on luxury car bonnet, showroom lighting, reflections on bodywork, photorealistic automotive photography',
  bag:       'product printed large on front of white canvas tote bag, filling the bag face, clean lifestyle setting, natural light, photorealistic fashion photography',
  ipad:      'product displayed fullscreen on iPad Pro filling entire screen, lying on minimalist desk, flat lay, natural light, photorealistic device mockup',
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
 
