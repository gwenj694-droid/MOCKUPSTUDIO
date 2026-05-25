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
  window:    'The provided image/design is displayed as a large printed poster mounted inside a luxury shop window display. Professional retail photography, warm interior ambient light, slight glass reflection, real-world commercial mockup, photorealistic, 8K.',
  phone:     'The provided design is shown on an iPhone screen, held naturally by a hand. Lifestyle photography, soft natural window light, blurred background, photorealistic product mockup, 8K.',
  laptop:    'The provided design fills the screen of an open MacBook Pro on a clean wooden desk with coffee cup. Natural side lighting, shallow depth of field, professional workspace photography, photorealistic, 8K.',
  billboard: 'The provided design is displayed on a large outdoor billboard in a city street at golden hour. Real photography, dramatic sky, urban environment, photorealistic advertising mockup, 8K.',
  book:      'The provided design is the cover of a hardback book lying on a marble surface. Editorial flat lay photography, coffee cup and pen beside it, natural light, photorealistic mockup, 8K.',
  poster:    'The provided design is a framed print hung on a white wall in a modern gallery. Professional interior photography, soft directional lighting, casting a subtle frame shadow, photorealistic, 8K.',
  shirt:     'The provided design is printed on the front of a white t-shirt worn by a person standing outdoors. Lifestyle photography, natural daylight, clean background, photorealistic clothing mockup, 8K.',
  mural:     'The provided design is painted as a large street art mural on a brick wall in an urban neighbourhood. Wide angle photography, natural daylight, photorealistic street mockup, 8K.',
  magazine:  'The provided design is featured as a full-page spread in a glossy open magazine lying on a marble surface. Editorial flat lay, natural light, photorealistic publishing mockup, 8K.',
  car:       'The provided design is applied as a vinyl wrap decal on the bonnet of a luxury car in a showroom. Studio lighting, reflections on the bodywork, photorealistic automotive mockup, 8K.',
  bag:       'The provided design is printed on a luxury white canvas tote bag resting on a table. Lifestyle photography, natural light, clean backdrop, photorealistic fashion mockup, 8K.',
  ipad:      'The provided design is displayed on an iPad Pro screen lying on a minimalist desk. Flat lay photography, natural light, accessories beside it, photorealistic device mockup, 8K.',
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
 
  // Endpoint cascade — best quality first
  const ENDPOINTS = [
    {
      // Best: Flux img2img — composites the actual design into the scene
      id: 'fal-ai/flux/dev/image-to-image',
      build: () => ({
        image_url: imageUrl,
        prompt: fullPrompt,
        strength: 0.85,
        num_inference_steps: 35,
        guidance_scale: 7,
        negative_prompt: 'blurry, low quality, distorted, text artifacts, watermark, ugly, duplicate, bad proportions, extra elements'
      })
    },
    {
      // Fallback: Bria product shot
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
      // Last resort: flux schnell (fast but lower quality)
      id: 'fal-ai/flux/schnell/image-to-image',
      build: () => ({
        image_url: imageUrl,
        prompt: fullPrompt,
        strength: 0.8,
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
 
