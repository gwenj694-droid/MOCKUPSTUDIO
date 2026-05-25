const express = require('express');
const cors    = require('cors');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const https   = require('https');
const http    = require('http');
const { createCanvas, loadImage, registerFont } = require('canvas');
const { fal } = require('@fal-ai/client');
const Anthropic = require('@anthropic-ai/sdk');
 
const app = express();
app.use(cors());
app.use(express.json({ limit: '30mb' }));
app.use(express.static('public'));
 
const FAL_KEY = process.env.FAL_API_KEY || '';
const ANT_KEY = process.env.ANTHROPIC_API_KEY || '';
fal.config({ credentials: FAL_KEY });
const ant = ANT_KEY ? new Anthropic({ apiKey: ANT_KEY }) : null;
 
// Register fonts
try {
  registerFont(path.join(__dirname,'fonts','Inter-Bold.ttf'),    { family:'Inter', weight:'bold' });
  registerFont(path.join(__dirname,'fonts','Inter-Regular.ttf'), { family:'Inter', weight:'normal' });
  console.log('Fonts OK');
} catch(e){ console.warn('Font load failed:', e.message); }
 
console.log('FAL:', FAL_KEY ? '✓' : '✗', '  Claude:', ANT_KEY ? '✓' : '✗');
 
// Upload
const storage = multer.diskStorage({
  destination: 'public/uploads/',
  filename: (_,f,cb) => cb(null, Date.now() + path.extname(f.originalname))
});
const upload = multer({ storage, limits:{ fileSize:30*1024*1024 } });
 
app.post('/api/upload', upload.single('file'), (req,res) => {
  if(!req.file) return res.status(400).json({ error:'No file' });
  res.json({ url:`${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`, filename:req.file.filename });
});
 
// Scenes
const SCENES = {
  car:             { prompt:'confident elegant woman standing next to a sleek luxury black car, holding a blank white smartphone screen facing toward the camera, golden hour sunset light, cinematic photography, bokeh background, photorealistic 8K', phone:{x:.36,y:.20,w:.26,h:.50} },
  flatlay_bag:     { prompt:'luxury feminine flat lay overhead shot, cream marble surface, pink designer handbag, gold keys, fresh pink roses, pearl bracelet, a blank white iPhone lying face-up showing empty white screen, warm natural light, editorial photography 4K', phone:{x:.50,y:.38,w:.30,h:.36} },
  cafe_table:      { prompt:'stylish woman sitting at a luxury cafe table, smiling, holding a blank white smartphone screen facing camera, cappuccino and flowers on table, warm ambient lighting, lifestyle photography, blurred background 8K', phone:{x:.36,y:.18,w:.28,h:.52} },
  desk_flatlay:    { prompt:'overhead luxury desk flat lay, white marble surface, open notebook, gold pen, small plant, blank white iPhone screen face-up, MacBook keyboard visible at edge, editorial photography, natural window light 4K', phone:{x:.52,y:.38,w:.28,h:.36} },
  woman_window:    { prompt:'confident woman in white blazer standing in front of large bright window, holding blank white smartphone screen toward camera, luxury minimal interior, natural diffused light, professional photography 8K', phone:{x:.36,y:.20,w:.28,h:.50} },
  story_model:     { prompt:'stylish female entrepreneur in modern bright office, looking at camera, holding blank white smartphone showing empty screen, confident pose, editorial fashion photography, 9:16 portrait 4K', phone:{x:.36,y:.22,w:.28,h:.46}, story:true },
  story_lifestyle: { prompt:'beautiful woman walking in luxury shopping district, holding blank white smartphone screen toward camera, golden hour sunlight, designer outfit, blurred city background, lifestyle fashion photography, 9:16 portrait 8K', phone:{x:.36,y:.20,w:.28,h:.48}, story:true },
  laptop_cafe:     { prompt:'stylish woman working at a bright modern cafe, open MacBook with blank white screen visible facing camera, coffee cup beside it, flowers, warm light, lifestyle photography 8K', phone:{x:.25,y:.22,w:.50,h:.40}, laptop:true },
  rooftop:         { prompt:'confident woman on luxury hotel rooftop terrace, city skyline behind her, holding blank white smartphone toward camera, golden sunset light, editorial fashion photography, cinematic 8K', phone:{x:.37,y:.22,w:.26,h:.48} },
  minimal_studio:  { prompt:'female model in elegant cream outfit, holding blank white smartphone screen facing camera, clean white studio background, dramatic side lighting, commercial photography 8K', phone:{x:.37,y:.20,w:.26,h:.48} },
  pool_villa:      { prompt:'luxury infinity pool villa, elegant woman in swimwear, blank white smartphone lying on marble surface beside pool, tropical flowers, blue water, golden afternoon light, aspirational lifestyle photography 8K', phone:{x:.48,y:.44,w:.28,h:.34} },
  flowers_flatlay: { prompt:'luxury flat lay overhead, soft pink and white peonies, cream linen fabric, blank white iPhone face-up, pearl jewellery, gold pen, editorial feminine photography, natural light 4K', phone:{x:.46,y:.34,w:.30,h:.36} },
};
 
const FORMATS = {
  square:  { w:1080, h:1080 },
  portrait:{ w:1080, h:1350 },
  story:   { w:1080, h:1920 },
};
 
function fetchBuf(url){
  return new Promise((ok,fail)=>{
    const mod=url.startsWith('https')?https:http;
    mod.get(url,res=>{ const c=[]; res.on('data',d=>c.push(d)); res.on('end',()=>ok(Buffer.concat(c))); res.on('error',fail); }).on('error',fail);
  });
}
 
function rr(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.arcTo(x+w,y,x+w,y+r,r);
  ctx.lineTo(x+w,y+h-r); ctx.arcTo(x+w,y+h,x+w-r,y+h,r);
  ctx.lineTo(x+r,y+h); ctx.arcTo(x,y+h,x,y+h-r,r);
  ctx.lineTo(x,y+r); ctx.arcTo(x,y,x+r,y,r);
  ctx.closePath();
}
 
function drawPhone(ctx, design, px, py, pw, ph, isLaptop){
  if(isLaptop){
    // Laptop screen frame
    const g=ctx.createLinearGradient(px,py,px+pw,py+ph);
    g.addColorStop(0,'#2a2a2a'); g.addColorStop(1,'#1a1a1a');
    ctx.fillStyle=g; rr(ctx,px,py,pw,ph,6); ctx.fill();
    const bx=px+8,by=py+6,bw=pw-16,bh=ph-12;
    ctx.fillStyle='#050508'; rr(ctx,bx,by,bw,bh,4); ctx.fill();
    if(design){ ctx.save(); rr(ctx,bx,by,bw,bh,4); ctx.clip(); ctx.drawImage(design,bx,by,bw,bh); ctx.restore(); }
    ctx.fillStyle='#222'; rr(ctx,px-14,py+ph,pw+28,10,0,0,4,4); ctx.fill();
    return;
  }
  const r=Math.round(pw*0.11);
  // Shadow
  ctx.save();
  ctx.shadowColor='rgba(0,0,0,0.7)'; ctx.shadowBlur=32; ctx.shadowOffsetY=12;
  const bg=ctx.createLinearGradient(px,py,px+pw,py+ph);
  bg.addColorStop(0,'#3a3a3a'); bg.addColorStop(.4,'#242424'); bg.addColorStop(1,'#1a1a1a');
  ctx.fillStyle=bg; rr(ctx,px,py,pw,ph,r); ctx.fill();
  ctx.restore();
  ctx.fillStyle=bg; rr(ctx,px,py,pw,ph,r); ctx.fill();
  ctx.strokeStyle='rgba(255,255,255,0.15)'; ctx.lineWidth=1.5; rr(ctx,px,py,pw,ph,r); ctx.stroke();
  // Screen
  const sx=px+pw*.04,sy=py+ph*.05,sw=pw*.92,sh=ph*.90,sr=r*.7;
  ctx.fillStyle='#020209'; rr(ctx,sx,sy,sw,sh,sr); ctx.fill();
  if(design){
    ctx.save(); rr(ctx,sx,sy,sw,sh,sr); ctx.clip(); ctx.drawImage(design,sx,sy,sw,sh);
    const gl=ctx.createLinearGradient(sx,sy,sx+sw*.55,sy+sh*.45);
    gl.addColorStop(0,'rgba(255,255,255,.08)'); gl.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=gl; ctx.fillRect(sx,sy,sw,sh); ctx.restore();
  }
  // Notch
  ctx.fillStyle='#111'; rr(ctx,px+pw/2-pw*.14,sy+3,pw*.28,ph*.042,ph*.018); ctx.fill();
  // Home bar
  ctx.fillStyle='rgba(255,255,255,.22)'; rr(ctx,px+pw/2-pw*.15,py+ph-ph*.036,pw*.30,ph*.016,ph*.008); ctx.fill();
}
 
// Generate mockup
app.post('/api/mockup', async (req,res)=>{
  if(!FAL_KEY) return res.status(500).json({ error:'FAL_API_KEY not set in Railway env vars' });
  const { imageUrl, scene, format='square', headline='', subtext='', cta='', customPrompt } = req.body;
  if(!imageUrl) return res.status(400).json({ error:'No image URL' });
 
  const sc  = SCENES[scene] || SCENES.car;
  const fmt = FORMATS[format] || FORMATS.square;
  const bgPrompt = customPrompt || sc.prompt;
  const isLaptop = scene==='laptop_cafe';
 
  // Scale phone pos to chosen format
  const srcH = sc.story ? 1920 : 1080;
  const scaleY = fmt.h / srcH;
  const pp = sc.phone;
  const phonePos = { x:pp.x, y:pp.y*scaleY, w:pp.w, h:pp.h*scaleY };
 
  console.log(`[mockup] scene=${scene} format=${fmt.w}x${fmt.h}`);
 
  try {
    // 1. Generate background
    const bgResult = await fal.subscribe('fal-ai/flux/dev', {
      input:{ prompt:bgPrompt, image_size:{ width:fmt.w, height:fmt.h }, num_inference_steps:25, guidance_scale:3.5, num_images:1 },
      logs:false
    });
    const bgUrl = bgResult.data?.images?.[0]?.url || bgResult.data?.image?.url;
    if(!bgUrl) throw new Error('Background generation failed');
    console.log('[mockup] BG ready');
 
    // 2. Load images
    const bgBuf = await fetchBuf(bgUrl);
    const bgImg  = await loadImage(bgBuf);
 
    const fname = imageUrl.split('/uploads/').pop().split('?')[0];
    const fpath = path.join(__dirname,'public/uploads',fname);
    const designImg = fs.existsSync(fpath) ? await loadImage(fpath) : await loadImage(await fetchBuf(imageUrl));
 
    // 3. Composite
    const W=bgImg.width||fmt.w, H=bgImg.height||fmt.h;
    const canvas=createCanvas(W,H);
    const ctx=canvas.getContext('2d');
    ctx.drawImage(bgImg,0,0,W,H);
 
    const px=Math.round(phonePos.x*W), py=Math.round(phonePos.y*H);
    const pw=Math.round(phonePos.w*W), ph=Math.round(phonePos.h*H);
    drawPhone(ctx, designImg, px, py, pw, ph, isLaptop);
 
    // 4. Text overlay
    if(headline||subtext||cta){
      const bandH=Math.round(H*.26);
      const band=ctx.createLinearGradient(0,H-bandH,0,H);
      band.addColorStop(0,'rgba(0,0,0,0)'); band.addColorStop(.35,'rgba(0,0,0,.72)'); band.addColorStop(1,'rgba(0,0,0,.9)');
      ctx.fillStyle=band; ctx.fillRect(0,H-bandH,W,bandH);
      const pad=Math.round(W*.07); let ty=H-bandH+Math.round(bandH*.2);
      if(headline){
        const fs=Math.round(W*.06);
        ctx.font=`bold ${fs}px Inter, Arial, sans-serif`;
        ctx.fillStyle='#fff'; ctx.shadowColor='rgba(0,0,0,.5)'; ctx.shadowBlur=10;
        const words=headline.split(' '),maxW=W-pad*2; let line='',lines=[];
        words.forEach(w=>{ const t=line?line+' '+w:w; if(ctx.measureText(t).width>maxW&&line){lines.push(line);line=w;}else line=t; });
        if(line) lines.push(line);
        lines.forEach(l=>{ ctx.fillText(l,pad,ty); ty+=Math.round(fs*1.28); });
        ctx.shadowBlur=0; ty+=Math.round(W*.01);
      }
      if(subtext){ const fs=Math.round(W*.035); ctx.font=`${fs}px Inter, Arial, sans-serif`; ctx.fillStyle='rgba(255,255,255,.78)'; ctx.fillText(subtext,pad,ty); ty+=Math.round(fs*1.6); }
      if(cta){ const fs=Math.round(W*.032); ctx.font=`bold ${fs}px Inter, Arial, sans-serif`; ctx.fillStyle='#E8B84B'; ctx.fillText('→ '+cta,pad,ty); }
    }
 
    // 5. Save
    const outName=`promo-${Date.now()}.jpg`;
    fs.writeFileSync(path.join(__dirname,'public/uploads',outName), canvas.toBuffer('image/jpeg',{quality:.93}));
 
    // Also save BG separately for editor
    const bgName=`bg-${Date.now()}.jpg`;
    const bgC=createCanvas(W,H); bgC.getContext('2d').drawImage(bgImg,0,0,W,H);
    fs.writeFileSync(path.join(__dirname,'public/uploads',bgName), bgC.toBuffer('image/jpeg',{quality:.95}));
 
    const base=`${req.protocol}://${req.get('host')}`;
    res.json({
      url:      `${base}/uploads/${outName}`,
      bgUrl:    `${base}/uploads/${bgName}`,
      designUrl:`${base}/uploads/${fname}`,
      phonePos, canvasW:W, canvasH:H,
      headline, subtext, cta
    });
 
  } catch(e){
    console.error('[mockup]',e.message);
    res.status(500).json({ error:e.message });
  }
});
 
// Claude text generation
app.post('/api/generate-text', async (req,res)=>{
  if(!ant) return res.status(500).json({ error:'ANTHROPIC_API_KEY not set' });
  const { productName, productDesc='', price='', platform='instagram' } = req.body;
  if(!productName) return res.status(400).json({ error:'Product name required' });
  try{
    const msg = await ant.messages.create({
      model:'claude-haiku-4-5-20251001', max_tokens:200,
      messages:[{ role:'user', content:`You are a high-converting social media copywriter for female digital entrepreneurs.
Write promotional text for: ${productName}. Description: ${productDesc}. Price: ${price}. Platform: ${platform}.
Return ONLY valid JSON: {"headline":"MAX 6 WORDS ALL CAPS","subtext":"one compelling line max 10 words","cta":"short action max 6 words"}` }]
    });
    res.json(JSON.parse(msg.content[0].text.replace(/```json|```/g,'').trim()));
  } catch(e){ res.status(500).json({ error:e.message }); }
});
 
app.get('/health',(_,res)=>res.json({ ok:true, fal:!!FAL_KEY, claude:!!ANT_KEY }));
const PORT=process.env.PORT||3000;
app.listen(PORT,()=>console.log(`Promo Studio :${PORT}`));
