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
  window:    'professional photograph of a poster mounted on a large glass window display of an upscale coffee shop, warm ambient interior lighting, shallow depth of field, bokeh background showing cafe interior, ultra realistic product mockup photography, 8K',
  phone:     'close-up photograph of a smartphone screen displaying the design, person holding phone, modern lifestyle setting, soft natural light, ultra realistic product mockup photography',
  laptop:    'professional photograph of an open MacBook laptop displaying the design on screen, modern minimalist desk workspace, natural side lighting, ultra realistic product mockup photography, 8K',
  billboard: 'professional aerial photograph of a large outdoor billboard displaying the design in a busy city street intersection, golden hour sunlight, ultra realistic advertising mockup photography, 8K',
  book:      'professional photograph of an open hardcover book with the design printed on its pages, lying on a marble surface with coffee cup, editorial photography style, ultra realistic mockup, 8K',
  poster:    'professional photograph of a framed poster on a clean white gallery wall, soft museum lighting, shadow from frame, ultra realistic interior mockup photography, 8K',
  shirt:     'professional photograph of a person wearing a t-shirt with the design printed on the front, lifestyle outdoor setting, natural daylight, ultra realistic clothing mockup photography',
  mural:     'professional photograph of a large mural painted on a brick wall in an urban street art setting, wide angle, graffiti neighbourhood, ultra realistic street mockup photography, 8K',
  magazine:  'professional photograph of a glossy magazine lying open on a marble surface, the design featured as a full page spread, editorial flat lay photography, 8K',
  car:       'professional photograph of a luxury car bonnet with the design applied as a vinyl wrap decal, showroom lighting, ultra realistic automotive mockup photography, 8K',
  bag:       'professional photograph of a luxury tote bag with the design printed on it, lifestyle setting, natural light, ultra realistic product mockup photography',
  ipad:      'professional photograph of an iPad Pro displaying the design on screen, lying on a clean desk with accessories, modern workspace, ultra realistic device mockup photography, 8K',
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
 
  // Full prompt instructs FAL to composite the design into the scene
  const fullPrompt = `${scenePrompt}. The design/image shown is integrated naturally into the scene, perfectly perspective-warped and lit to match the environment. Photorealistic compositing, professional commercial photography.`;
 
  console.log(`[mockup] scene=${scene} url=${imageUrl.substring(0,60)}`);
 
  // Try product-shot first (best for scene compositing), fall back to img2img
  const ENDPOINTS = [
    {
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
      id: 'fal-ai/flux/dev/image-to-image',
      build: () => ({
        image_url: imageUrl,
        prompt: fullPrompt,
        strength: 0.72,
        num_inference_steps: 30,
        guidance_scale: 4.5,
        negative_prompt: 'blurry, low quality, distorted, watermark, ugly, bad composition'
      })
    },
    {
      id: 'fal-ai/flux-realism',
      build: () => ({
        image_url: imageUrl,
        prompt: fullPrompt,
        strength: 0.7,
        num_inference_steps: 28
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
 
