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
app.use(express.static('public', {
  setHeaders: (res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  }
}));
 
// Image proxy
app.get('/api/img/:filename', (req, res) => {
  const p = path.join(__dirname, 'public/uploads', path.basename(req.params.filename));
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'Not found' });
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  res.sendFile(p);
});
 
const FAL_KEY = process.env.FAL_API_KEY || '';
const ANT_KEY = process.env.ANTHROPIC_API_KEY || '';
fal.config({ credentials: FAL_KEY });
const ant = ANT_KEY ? new Anthropic({ apiKey: ANT_KEY }) : null;
 
try {
  registerFont(path.join(__dirname,'fonts','Inter-Bold.ttf'),    { family:'Inter', weight:'bold' });
  registerFont(path.join(__dirname,'fonts','Inter-Regular.ttf'), { family:'Inter', weight:'normal' });
  console.log('Fonts OK');
} catch(e){ console.warn('Font load failed:', e.message); }
 
console.log('FAL:', FAL_KEY ? '✓' : '✗', '  Claude:', ANT_KEY ? '✓' : '✗');
 
const storage = multer.diskStorage({
  destination: 'public/uploads/',
  filename: (_,f,cb) => cb(null, Date.now() + path.extname(f.originalname))
});
const upload = multer({ storage, limits:{ fileSize:30*1024*1024 } });
 
app.post('/api/upload', upload.single('file'), (req,res) => {
  if(!req.file) return res.status(400).json({ error:'No file' });
  res.json({ url:`${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`, filename:req.file.filename });
});
 
const SCENES = {
  flatlay_marble: {
    prompt: 'luxury overhead editorial flat lay, straight down 90-degree shot, white veined marble surface, iPhone face-up with blank white screen in centre, fresh white gardenias scattered around it, single gold ring, espresso cup on small saucer, Architectural Digest editorial style, soft diffused daylight, 4K commercial photography',
    phone:{x:.35,y:.28,w:.38,h:.46}
  },
  flatlay_linen: {
    prompt: 'minimal editorial flat lay, overhead shot, crinkled cream linen fabric background, iPhone face-up with blank white screen, dried pampas grass, small brown leather journal, vintage brass pen, single dried rose, warm earthy tones, editorial lifestyle photography, natural side light 4K',
    phone:{x:.36,y:.30,w:.36,h:.44}
  },
  flatlay_neon: {
    prompt: 'bold editorial overhead flat lay, black matte surface, iPhone face-up with blank white screen glowing, neon pink and purple LED light strips creating dramatic colour shadows, holographic confetti scattered, modern Y2K aesthetic, studio photography with coloured gels 4K',
    phone:{x:.36,y:.28,w:.36,h:.46}
  },
  coffee_aesthetic: {
    prompt: 'cosy lifestyle editorial photograph, side angle shot, iPhone propped up against a stack of coffee table books, blank white screen visible, steaming latte art beside it in a ceramic cup, open book with glasses on top, candle flickering in background, warm amber morning light through sheer curtain, photorealistic 8K',
    phone:{x:.30,y:.15,w:.32,h:.62}
  },
  bed_morning: {
    prompt: 'aspirational lifestyle editorial, iPhone propped against fluffy white pillow on luxurious made bed, blank white screen clearly visible, white duvet with subtle texture, sunlight streaming through sheer curtains creating beautiful lens flare, a tray with croissant and orange juice at edge, morning light editorial photography 8K',
    phone:{x:.32,y:.14,w:.32,h:.60}
  },
  botanicals: {
    prompt: 'editorial still life photograph, iPhone standing upright leaning against a large tropical leaf monstera plant, blank white screen facing camera, terracotta pot, warm afternoon sunlight casting leaf shadows across the phone screen, minimal white wall background, lifestyle interior photography 8K',
    phone:{x:.32,y:.15,w:.30,h:.58}
  },
  neon_city_night: {
    prompt: 'cinematic night photography, close-up of a hand with manicured nails holding an iPhone with blank white screen, neon city lights reflecting on phone glass, rain-slicked pavement in background with purple and pink reflections, Blade Runner moody aesthetic, cinema 4K',
    phone:{x:.28,y:.16,w:.42,h:.68}
  },
  golden_hour_hands: {
    prompt: 'cinematic editorial close-up, elegant hands with gold rings holding an iPhone horizontally with blank white screen facing camera, golden hour backlight creating a halo glow around phone, lens flare, warm amber and orange bokeh, fashion editorial photography 8K',
    phone:{x:.18,y:.24,w:.64,h:.54}
  },
  shadow_play: {
    prompt: 'artistic editorial photograph, iPhone standing against a white wall, blank white screen visible, dramatic side window light casting beautiful geometric shadow patterns across the wall and phone, strong contrast, minimal composition, fine art photography 8K',
    phone:{x:.34,y:.12,w:.28,h:.62}
  },
  amalfi_coast: {
    prompt: 'luxury travel editorial photograph, iPhone propped on a sun-drenched terrace railing, blank white screen clearly visible, dramatic view of Amalfi coast cliffs and turquoise Mediterranean sea behind it, terracotta tiles and bougainvillea flowers, golden midday light, professional travel photography 8K',
    phone:{x:.30,y:.12,w:.30,h:.60}
  },
  hotel_pool: {
    prompt: 'aspirational luxury hotel editorial, iPhone placed on white marble edge of an infinity pool, blank white screen face-up reflecting blue sky, clear turquoise water with sunlight patterns, rolled white towel beside it, tropical palm fronds in upper corner, overhead angle, resort photography 8K',
    phone:{x:.36,y:.32,w:.36,h:.42}
  },
  private_jet: {
    prompt: 'aspirational luxury editorial, iPhone with blank white screen placed on cream leather private jet seat, porthole window with blue sky and clouds visible, cashmere throw blanket, champagne flute, subtle luxury branding, aspirational lifestyle commercial photography 8K',
    phone:{x:.34,y:.20,w:.32,h:.58}
  },
  mirror_reflection: {
    prompt: 'artistic editorial fashion photograph, stylish woman photographing herself in a large ornate gold-framed mirror, you see her reflection holding the phone, blank white screen visible in reflection, luxury hotel lobby or dressing room, warm chandelier light, fashion editorial photography 8K',
    phone:{x:.36,y:.22,w:.28,h:.52}
  },
  from_above_cafe: {
    prompt: 'editorial overhead bird-eye view photograph, woman in chic outfit sitting at a cafe table photographed from directly above, iPhone on table beside her coffee with blank white screen facing up, her hands on keyboard of laptop, flowers, notebook, aerial lifestyle editorial photography 8K',
    phone:{x:.52,y:.38,w:.28,h:.38}
  },
  walking_candid: {
    prompt: 'candid editorial street photography, stylish woman in motion walking in a European cobblestone street, she glances down at phone she holds loosely at her side with screen visible, golden hour side light, motion blur background, decisive moment editorial photography 8K',
    phone:{x:.40,y:.40,w:.24,h:.44}
  },
  product_closeup: {
    prompt: 'clean commercial product photograph, extreme close-up of iPhone propped at slight angle showing blank white screen, perfectly lit with soft box lighting creating subtle screen glare, pure white seamless background, luxury product photography for advertising, 8K',
    phone:{x:.20,y:.10,w:.60,h:.80}
  },
  desk_power: {
    prompt: 'editorial power desk photograph, angle shot from desk level, iPhone propped against a sleek laptop showing blank white screen, behind it out of focus: second monitor, designer desk lamp, architectural plant, the desk of a successful female CEO, professional editorial photography 8K',
    phone:{x:.28,y:.14,w:.38,h:.62}
  },
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
 
// ── drawPhone: supports dark / light / gold frame styles ──
function drawPhone(ctx, design, px, py, pw, ph, isLaptop, phoneStyle){
  phoneStyle = phoneStyle || 'dark';
 
  if(isLaptop){
    const g=ctx.createLinearGradient(px,py,px+pw,py+ph);
    g.addColorStop(0,'#2a2a2a'); g.addColorStop(1,'#1a1a1a');
    ctx.fillStyle=g; rr(ctx,px,py,pw,ph,6); ctx.fill();
    const bx=px+8,by=py+6,bw=pw-16,bh=ph-12;
    ctx.fillStyle='#050508'; rr(ctx,bx,by,bw,bh,4); ctx.fill();
    if(design){ ctx.save(); rr(ctx,bx,by,bw,bh,4); ctx.clip(); ctx.drawImage(design,bx,by,bw,bh); ctx.restore(); }
    ctx.fillStyle='#222'; rr(ctx,px-14,py+ph,pw+28,10,0,0,4,4); ctx.fill();
    return;
  }
 
  const r = Math.round(pw*0.11);
 
  // Drop shadow
  ctx.save();
  ctx.shadowColor='rgba(0,0,0,0.7)'; ctx.shadowBlur=32; ctx.shadowOffsetY=12;
 
  // Frame gradient
  const bg = ctx.createLinearGradient(px,py,px+pw,py+ph);
  if(phoneStyle === 'gold'){
    bg.addColorStop(0,'#C9A84C'); bg.addColorStop(.3,'#E8B84B');
    bg.addColorStop(.6,'#8B6100'); bg.addColorStop(1,'#E8B84B');
  } else if(phoneStyle === 'light'){
    bg.addColorStop(0,'#ffffff'); bg.addColorStop(.5,'#e0e0e0'); bg.addColorStop(1,'#c0c0c0');
  } else {
    bg.addColorStop(0,'#3a3a3a'); bg.addColorStop(.4,'#242424'); bg.addColorStop(1,'#1a1a1a');
  }
  ctx.fillStyle=bg; rr(ctx,px,py,pw,ph,r); ctx.fill();
  ctx.restore();
 
  // Frame border / glow
  if(phoneStyle === 'gold'){
    ctx.strokeStyle='rgba(255,230,150,0.7)'; ctx.lineWidth=2;
    rr(ctx,px,py,pw,ph,r); ctx.stroke();
    ctx.save();
    ctx.shadowColor='rgba(232,184,75,0.8)'; ctx.shadowBlur=18;
    ctx.strokeStyle='rgba(232,184,75,0.5)'; ctx.lineWidth=1;
    rr(ctx,px,py,pw,ph,r); ctx.stroke();
    ctx.restore();
  } else {
    ctx.strokeStyle = phoneStyle==='light' ? 'rgba(0,0,0,.1)' : 'rgba(255,255,255,0.15)';
    ctx.lineWidth=1.5; rr(ctx,px,py,pw,ph,r); ctx.stroke();
  }
 
  // Screen area
  const sx=px+pw*.04, sy=py+ph*.05, sw=pw*.92, sh=ph*.90, sr=r*.7;
  ctx.fillStyle = phoneStyle==='light' ? '#ffffff' : '#020209';
  rr(ctx,sx,sy,sw,sh,sr); ctx.fill();
 
  if(design){
    ctx.save(); rr(ctx,sx,sy,sw,sh,sr); ctx.clip();
    ctx.drawImage(design,sx,sy,sw,sh);
    const gl=ctx.createLinearGradient(sx,sy,sx+sw*.55,sy+sh*.45);
    gl.addColorStop(0,'rgba(255,255,255,.08)'); gl.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=gl; ctx.fillRect(sx,sy,sw,sh);
    ctx.restore();
  }
 
  // Notch
  const notchCol = phoneStyle==='light' ? '#dddddd' : phoneStyle==='gold' ? '#4a3200' : '#111111';
  ctx.fillStyle=notchCol;
  rr(ctx,px+pw/2-pw*.14,sy+3,pw*.28,ph*.042,ph*.018); ctx.fill();
 
  // Home bar
  ctx.fillStyle = phoneStyle==='light' ? 'rgba(0,0,0,.18)' : 'rgba(255,255,255,.22)';
  rr(ctx,px+pw/2-pw*.15,py+ph-ph*.036,pw*.30,ph*.016,ph*.008); ctx.fill();
}
 
app.post('/api/mockup', async (req,res)=>{
  if(!FAL_KEY) return res.status(500).json({ error:'FAL_API_KEY not set in Railway env vars' });
  const { imageUrl, imageUrl2, scene, format='square', headline='', subtext='', cta='', customPrompt, phoneStyle='dark' } = req.body;
  if(!imageUrl) return res.status(400).json({ error:'No image URL' });
 
  const sc   = SCENES[scene] || SCENES.flatlay_marble;
  const fmt  = FORMATS[format] || FORMATS.square;
  const bgPrompt = customPrompt || sc.prompt;
 
  const scaleY = fmt.h / 1080;
  const pp = sc.phone;
  const phonePos = { x:pp.x, y:pp.y*scaleY, w:pp.w, h:pp.h*scaleY };
 
  console.log(`[mockup] scene=${scene} format=${fmt.w}x${fmt.h} phone=${phoneStyle} dual=${!!imageUrl2}`);
 
  try {
    // 1. Generate background
    const bgResult = await fal.subscribe('fal-ai/flux/dev', {
      input:{ prompt:bgPrompt, image_size:{ width:fmt.w, height:fmt.h }, num_inference_steps:25, guidance_scale:3.5, num_images:1 },
      logs:false
    });
    const bgUrl = bgResult.data?.images?.[0]?.url || bgResult.data?.image?.url;
    if(!bgUrl) throw new Error('Background generation failed');
 
    // 2. Load images
    const bgBuf = await fetchBuf(bgUrl);
    const bgImg = await loadImage(bgBuf);
 
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
    drawPhone(ctx, designImg, px, py, pw, ph, false, phoneStyle);
 
    // Second phone if imageUrl2 provided
    if(imageUrl2){
      try{
        const fname2 = imageUrl2.split('/uploads/').pop().split('?')[0];
        const fpath2 = path.join(__dirname,'public/uploads',fname2);
        const designImg2 = fs.existsSync(fpath2) ? await loadImage(fpath2) : await loadImage(await fetchBuf(imageUrl2));
        const px2 = Math.min(px + Math.round(pw*1.12), W - pw - 10);
        drawPhone(ctx, designImg2, px2, py, pw, ph, false, phoneStyle);
      } catch(e){ console.warn('Second image failed:', e.message); }
    }
 
    // 4. Text overlay — gold shimmer style
    if(headline||subtext||cta){
      const bandH=Math.round(H*.32);
      const band=ctx.createLinearGradient(0,H-bandH,0,H);
      band.addColorStop(0,'rgba(0,0,0,0)'); band.addColorStop(.25,'rgba(0,0,0,.72)'); band.addColorStop(1,'rgba(0,0,0,0.92)');
      ctx.fillStyle=band; ctx.fillRect(0,H-bandH,W,bandH);
 
      // Gold shimmer accent line
      const lineGrd=ctx.createLinearGradient(0,0,W,0);
      lineGrd.addColorStop(0,'rgba(232,184,75,0)'); lineGrd.addColorStop(.5,'rgba(232,184,75,0.55)'); lineGrd.addColorStop(1,'rgba(232,184,75,0)');
      ctx.fillStyle=lineGrd; ctx.fillRect(0,H-bandH+4,W,2);
 
      const cx2=W/2; let ty=H-bandH+Math.round(bandH*.18);
      const maxW=W-Math.round(W*.08)*2;
      ctx.textAlign='center';
 
      if(headline){
        const fs=Math.round(W*.072);
        ctx.font=`bold ${fs}px Inter, Arial, sans-serif`;
        ctx.fillStyle='#ffffff';
        ctx.shadowColor='rgba(232,184,75,0.35)'; ctx.shadowBlur=18;
        const words=headline.split(' '); let line='',lines=[];
        words.forEach(w=>{ const t=line?line+' '+w:w; if(ctx.measureText(t).width>maxW&&line){lines.push(line);line=w;}else line=t; });
        if(line) lines.push(line);
        lines.forEach(l=>{ ctx.fillText(l,cx2,ty); ty+=Math.round(fs*1.22); });
        ctx.shadowBlur=0; ty+=Math.round(W*.015);
      }
      if(subtext){
        const fs=Math.round(W*.042);
        ctx.font=`${fs}px Inter, Arial, sans-serif`;
        ctx.fillStyle='rgba(255,255,255,0.88)';
        ctx.shadowColor='rgba(0,0,0,0.4)'; ctx.shadowBlur=6;
        ctx.fillText(subtext,cx2,ty); ctx.shadowBlur=0; ty+=Math.round(fs*1.7);
      }
      if(cta){
        const fs=Math.round(W*.038);
        ctx.font=`bold ${fs}px Inter, Arial, sans-serif`;
        ctx.fillStyle='#E8B84B';
        ctx.shadowColor='rgba(232,184,75,0.5)'; ctx.shadowBlur=10;
        ctx.fillText('→  '+cta+'  ←',cx2,ty); ctx.shadowBlur=0;
      }
      ctx.textAlign='left';
    }
 
    // 5. Save
    const outName=`promo-${Date.now()}.jpg`;
    fs.writeFileSync(path.join(__dirname,'public/uploads',outName), canvas.toBuffer('image/jpeg',{quality:.93}));
 
    const bgName=`bg-${Date.now()}.jpg`;
    const bgC=createCanvas(W,H); bgC.getContext('2d').drawImage(bgImg,0,0,W,H);
    fs.writeFileSync(path.join(__dirname,'public/uploads',bgName), bgC.toBuffer('image/jpeg',{quality:.95}));
 
    const base=`${req.protocol}://${req.get('host')}`;
    res.json({
      url:`${base}/uploads/${outName}`,
      bgUrl:`${base}/uploads/${bgName}`,
      designUrl:`${base}/uploads/${fname}`,
      phonePos, canvasW:W, canvasH:H,
      headline, subtext, cta
    });
 
  } catch(e){
    console.error('[mockup]',e.message);
    res.status(500).json({ error:e.message });
  }
});
 
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
