import { useState, useEffect, useRef, useCallback } from "react";

// ── Color utilities ──────────────────────────────────────────
const hsl2rgb = (h,s,l) => {
  s/=100; l/=100; const a=s*Math.min(l,1-l);
  const f=n=>{ const k=(n+h/30)%12; return Math.round(255*(l-a*Math.max(Math.min(k-3,9-k,1),-1))); };
  return [f(0),f(8),f(4)];
};
const hsl2hex = (h,s,l) => { const [r,g,b]=hsl2rgb(h,s,l); return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`; };
const hex2hsl = hex => {
  let r=parseInt(hex.slice(1,3),16)/255, g=parseInt(hex.slice(3,5),16)/255, b=parseInt(hex.slice(5,7),16)/255;
  const mx=Math.max(r,g,b), mn=Math.min(r,g,b), d=mx-mn; let h=0,s=0,l=(mx+mn)/2;
  if(d){ s=l>0.5?d/(2-mx-mn):d/(mx+mn);
    if(mx===r) h=((g-b)/d+(g<b?6:0))/6; else if(mx===g) h=((b-r)/d+2)/6; else h=((r-g)/d+4)/6; }
  return [Math.round(h*360),Math.round(s*100),Math.round(l*100)];
};
const rndHsl = () => [Math.floor(Math.random()*360), 65+Math.floor(Math.random()*25), 40+Math.floor(Math.random()*20)];
const w360 = v => ((v%360)+360)%360;
const angleDiff = (a,b) => { const d=Math.abs(((a-b)+360)%360); return Math.min(d,360-d); };

// ── Harmonies ────────────────────────────────────────────────
const HARM = {
  analogous:     {label:'Análoga',              fixed:null},
  monochromatic: {label:'Monocromática',        fixed:null},
  complementary: {label:'Complementaria',       fixed:2},
  splitcomp:     {label:'Split-complementaria', fixed:3},
  triadic:       {label:'Triádica',             fixed:3},
  tetradic:      {label:'Tetrádica',            fixed:4},
  square:        {label:'Cuadrada',             fixed:4},
  doublecomp:    {label:'Doble complementaria', fixed:4},
};
const getExpectedHs = (type,baseH,n) => {
  const mid=Math.floor(n/2);
  switch(type){
    case 'analogous':     return Array.from({length:n},(_,i)=>w360(baseH+(i-mid)*25));
    case 'monochromatic': return null;
    case 'complementary': return [baseH,w360(baseH+180)];
    case 'splitcomp':     return [baseH,w360(baseH+150),w360(baseH+210)];
    case 'triadic':       return [baseH,w360(baseH+120),w360(baseH+240)];
    case 'tetradic':      return [baseH,w360(baseH+60),w360(baseH+180),w360(baseH+240)];
    case 'square':        return [baseH,w360(baseH+90),w360(baseH+180),w360(baseH+270)];
    case 'doublecomp':    return [baseH,w360(baseH+180),w360(baseH+30),w360(baseH+210)];
    default: return null;
  }
};
const buildHarm = (type,h,s,l,n) => {
  const mid=Math.floor(n/2);
  switch(type){
    case 'analogous':     return Array.from({length:n},(_,i)=>[w360(h+(i-mid)*25),s,l]);
    case 'monochromatic': return Array.from({length:n},(_,i)=>[h,s,Math.max(20,Math.min(80,20+i*(55/Math.max(n-1,1))))]);
    case 'complementary': return [[h,s,l],[w360(h+180),s,l]];
    case 'splitcomp':     return [[h,s,l],[w360(h+150),s,l],[w360(h+210),s,l]];
    case 'triadic':       return [[h,s,l],[w360(h+120),s,l],[w360(h+240),s,l]];
    case 'tetradic':      return [[h,s,l],[w360(h+60),s,l],[w360(h+180),s,l],[w360(h+240),s,l]];
    case 'square':        return [[h,s,l],[w360(h+90),s,l],[w360(h+180),s,l],[w360(h+270),s,l]];
    case 'doublecomp':    { const h2=w360(h+30); return [[h,s,l],[w360(h+180),s,l],[h2,s,l],[w360(h2+180),s,l]]; }
    default: return [[h,s,l]];
  }
};

// ── Seeded RNG ───────────────────────────────────────────────
const mkRng = s0 => {
  let s=s0|0;
  return ()=>{ s=s+0x6D2B79F5|0; let t=Math.imul(s^s>>>15,1|s); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; };
};

// ── Scene drawing ────────────────────────────────────────────
const mkCs = (colors,ints) => colors.map(([h,s,l],i)=>hsl2rgb(h,s,l*(ints[i]??100)/100).join(','));

const drawFocos=(ctx,W,H,cs,rng)=>{ ctx.globalCompositeOperation='screen'; const n=6+Math.floor(rng()*8); for(let i=0;i<n;i++){ const c=cs[Math.floor(rng()*cs.length)],x=rng()*W,y=rng()*H,rx=80+rng()*160,ry=rx*(0.5+rng()*0.5); const g=ctx.createRadialGradient(x,y,0,x,y,rx); g.addColorStop(0,`rgba(${c},.92)`);g.addColorStop(.28,`rgba(${c},.52)`);g.addColorStop(.65,`rgba(${c},.13)`);g.addColorStop(1,`rgba(${c},0)`); ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(x,y,rx,ry,rng()*Math.PI*2,0,Math.PI*2);ctx.fill(); }};
const drawHaces=(ctx,W,H,cs,rng)=>{ ctx.globalCompositeOperation='screen'; const n=5+Math.floor(rng()*6); for(let i=0;i<n;i++){ const c=cs[Math.floor(rng()*cs.length)],x0=rng()*W*1.2-W*.1,sp=14+rng()*58,ang=-.48+rng()*.96; ctx.save();ctx.translate(x0,0);ctx.rotate(ang); const g=ctx.createLinearGradient(-sp,0,sp,0); g.addColorStop(0,`rgba(${c},0)`);g.addColorStop(.5,`rgba(${c},.68)`);g.addColorStop(1,`rgba(${c},0)`); ctx.fillStyle=g;ctx.fillRect(-sp*3,-H*.15,sp*6,H*1.35);ctx.restore(); }};
const drawCampos=(ctx,W,H,cs,rng)=>{ ctx.globalCompositeOperation='screen'; const n=cs.length+2; for(let i=0;i<n;i++){ const c=cs[Math.floor(rng()*cs.length)],x=rng()*W,y=rng()*H,r=W*.35+rng()*W*.65; const g=ctx.createRadialGradient(x,y,0,x,y,r); g.addColorStop(0,`rgba(${c},.42)`);g.addColorStop(.55,`rgba(${c},.14)`);g.addColorStop(1,`rgba(${c},0)`); ctx.fillStyle=g;ctx.fillRect(0,0,W,H); }};
const drawZonas=(ctx,W,H,cs,rng)=>{ ctx.globalCompositeOperation='source-over'; const n=cs.length+2+Math.floor(rng()*4); for(let i=0;i<n;i++){ const c=cs[Math.floor(rng()*cs.length)],x=rng()*W,y=rng()*H,pts=5+Math.floor(rng()*5); ctx.beginPath(); for(let j=0;j<pts;j++){ const a=(j/pts)*Math.PI*2,r=90+rng()*230,px=x+Math.cos(a)*r*(.4+rng()*.6),py=y+Math.sin(a)*r*(.4+rng()*.6); j===0?ctx.moveTo(px,py):ctx.lineTo(px,py); } ctx.closePath();ctx.fillStyle=`rgba(${c},.3)`;ctx.fill(); }};
const drawBloques=(ctx,W,H,cs,rng)=>{ ctx.globalCompositeOperation='source-over'; const bw=W/cs.length; cs.forEach((c,i)=>{ ctx.fillStyle=`rgb(${c})`;ctx.fillRect(i*bw,0,bw+1,H); const g=ctx.createLinearGradient(0,0,0,H); g.addColorStop(0,'rgba(0,0,0,.42)');g.addColorStop(.28,'rgba(0,0,0,0)');g.addColorStop(.72,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,0,0,.48)'); ctx.fillStyle=g;ctx.fillRect(i*bw,0,bw+1,H); ctx.fillStyle='rgba(0,0,0,.65)';ctx.fillRect(i*bw-.5,0,1.5,H); }); };

const drawScene=(canvas,colors,ints,mode,mirror,seed)=>{
  if(!canvas||!colors.length) return;
  const ctx=canvas.getContext('2d'),W=canvas.width,H=canvas.height,rng=mkRng(seed),cs=mkCs(colors,ints),dW=mirror?Math.ceil(W/2):W;
  ctx.clearRect(0,0,W,H); ctx.fillStyle='#000'; ctx.fillRect(0,0,W,H);
  ({focos:drawFocos,haces:drawHaces,campos:drawCampos,zonas:drawZonas,bloques:drawBloques}[mode]||drawFocos)(ctx,dW,H,cs,rng);
  ctx.globalCompositeOperation='source-over';
  if(mirror){
    const tmp=document.createElement('canvas'); tmp.width=dW; tmp.height=H;
    tmp.getContext('2d').drawImage(canvas,0,0,dW,H,0,0,dW,H);
    ctx.save();ctx.translate(W,0);ctx.scale(-1,1);ctx.drawImage(tmp,0,0);ctx.restore();
    const cx=W/2,bw=26,g=ctx.createLinearGradient(cx-bw,0,cx+bw,0);
    g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(.5,'rgba(0,0,0,.55)');g.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=g;ctx.fillRect(cx-bw,0,bw*2,H);
  }
};

// ── Chromatic Wheel ──────────────────────────────────────────
const drawWheel=(canvas,colors,harmType,baseH,locked,flags)=>{
  if(!canvas||!colors.length) return;
  const ctx=canvas.getContext('2d'),sz=canvas.width,cx=sz/2,cy=sz/2,R=sz*.42,ri=R*.36;
  ctx.clearRect(0,0,sz,sz);
  // Hue ring
  for(let i=0;i<360;i++){
    const a1=(i/360)*Math.PI*2-Math.PI/2,a2=((i+1)/360)*Math.PI*2-Math.PI/2;
    ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,R,a1,a2);ctx.closePath();
    ctx.fillStyle=`hsl(${i},80%,50%)`;ctx.fill();
  }
  // Inner dark
  ctx.beginPath();ctx.arc(cx,cy,ri,0,Math.PI*2);ctx.fillStyle='#000';ctx.fill();
  ctx.beginPath();ctx.arc(cx,cy,ri+1,0,Math.PI*2);ctx.strokeStyle='rgba(255,255,255,.08)';ctx.lineWidth=1;ctx.stroke();

  // Expected positions (dashed)
  const expHs=getExpectedHs(harmType,baseH,colors.length);
  if(expHs){
    const r=(R+ri)/2;
    const eps=expHs.map(h=>[cx+Math.cos((h/360)*Math.PI*2-Math.PI/2)*r, cy+Math.sin((h/360)*Math.PI*2-Math.PI/2)*r]);
    ctx.setLineDash([3,5]);ctx.strokeStyle='rgba(255,255,255,.2)';ctx.lineWidth=1;
    ctx.beginPath();eps.forEach(([x,y],i)=>i===0?ctx.moveTo(x,y):ctx.lineTo(x,y));
    if(eps.length>2) ctx.closePath();ctx.stroke();ctx.setLineDash([]);
  }

  // Connecting lines
  const r=(R+ri)/2;
  const pts=colors.map(([h])=>[cx+Math.cos((h/360)*Math.PI*2-Math.PI/2)*r, cy+Math.sin((h/360)*Math.PI*2-Math.PI/2)*r]);
  ctx.strokeStyle='rgba(0,160,250,.55)';ctx.lineWidth=1.5;
  ctx.beginPath();pts.forEach(([x,y],i)=>i===0?ctx.moveTo(x,y):ctx.lineTo(x,y));
  if(pts.length>2) ctx.closePath();ctx.stroke();

  // Base H tick
  const ba=(baseH/360)*Math.PI*2-Math.PI/2;
  ctx.strokeStyle='rgba(255,255,255,.5)';ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(cx+Math.cos(ba)*R,cy+Math.sin(ba)*R);ctx.lineTo(cx+Math.cos(ba)*(R+9),cy+Math.sin(ba)*(R+9));ctx.stroke();

  // Dots
  colors.forEach(([h,s,l],i)=>{
    const [x,y]=pts[i],hex=hsl2hex(h,s,l),isLk=!!locked[i],isFlg=!!flags[i];
    ctx.beginPath();ctx.arc(x,y,isLk?10:7.5,0,Math.PI*2);
    ctx.fillStyle=isFlg?'#FF1D1D':isLk?'#00A0FA':'rgba(255,255,255,.65)';ctx.fill();
    ctx.beginPath();ctx.arc(x,y,6,0,Math.PI*2);ctx.fillStyle=hex;ctx.fill();
    ctx.fillStyle='#fff';ctx.font='bold 7px monospace';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(i+1,x,y);
  });
};

// ── Main ─────────────────────────────────────────────────────
const CYAN='#00A0FA', RED='#FF1D1D', FONT="'Courier New',Courier,monospace";
const btnStyle=(active,danger,extra={})=>({
  background:active?'rgba(0,160,250,.15)':danger?'rgba(255,29,29,.12)':'rgba(255,255,255,.04)',
  border:`1px solid ${active?CYAN:danger?RED:'rgba(255,255,255,.12)'}`,
  color:active?CYAN:danger?RED:'rgba(255,255,255,.8)',
  fontFamily:FONT,fontSize:'11px',padding:'5px 10px',borderRadius:'3px',cursor:'pointer',
  letterSpacing:'.5px',boxShadow:active?`0 0 8px rgba(0,160,250,.3)`:danger?`0 0 6px rgba(255,29,29,.2)`:'none',
  transition:'all .15s',...extra
});
const panStyle={background:'rgba(255,255,255,.03)',border:'1px solid rgba(255,255,255,.08)',borderRadius:'4px',padding:'8px 10px'};
const lbl={fontSize:'9px',color:'rgba(255,255,255,.35)',letterSpacing:'2px',textTransform:'uppercase'};

export default function App(){
  const [harmType,setHarmType]=useState('triadic');
  const [count,setCount]=useState(4);
  const [base,setBase]=useState(rndHsl);
  const [locked,setLocked]=useState({});
  const [colors,setColors]=useState([]);
  const [ints,setInts]=useState({});
  const [flags,setFlags]=useState({});
  const [mode,setMode]=useState('focos');
  const [mirror,setMirror]=useState(false);
  const [seed,setSeed]=useState(()=>Math.floor(Math.random()*99999));
  const [saved,setSaved]=useState([]);
  const [showSaved,setShowSaved]=useState(false);
  const [showWheel,setShowWheel]=useState(false);
  const [saveName,setSaveName]=useState('');
  const [msg,setMsg]=useState('');
  const [tooltip,setTooltip]=useState(null);
  const cvs=useRef(null), wCvs=useRef(null);

  const fixedN=HARM[harmType].fixed, effN=fixedN??count;

  const computeFlags=useCallback((cols,type,bh,n,lck)=>{
    const expHs=getExpectedHs(type,bh,n); if(!expHs) return {};
    const f={}; Object.keys(lck).forEach(k=>{ const i=+k; if(i<cols.length&&expHs[i]!==undefined&&angleDiff(cols[i][0],expHs[i])>15) f[i]=true; }); return f;
  },[]);

  const applyHarm=useCallback((b,type,n,lck)=>buildHarm(type,b[0],b[1],b[2],n).map((c,i)=>lck[i]??c),[]);

  const refresh=(cols,b,type,n,lck)=>{
    const f=computeFlags(cols,type??harmType,(b??base)[0],n??effN,lck??locked);
    setColors(cols); setFlags(f);
  };

  useEffect(()=>{
    const c=applyHarm(base,harmType,effN,{}); setColors(c);
    setSaveName(`${HARM[harmType].label} · ${new Date().toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})}`);
  },[]);

  useEffect(()=>{ if(cvs.current&&colors.length) drawScene(cvs.current,colors,ints,mode,mirror,seed); },[colors,ints,mode,mirror,seed]);
  useEffect(()=>{ if(showWheel&&wCvs.current&&colors.length) drawWheel(wCvs.current,colors,harmType,base[0],locked,flags); },[showWheel,colors,harmType,base,locked,flags]);

  const flash=t=>{ setMsg(t); setTimeout(()=>setMsg(''),2500); };

  const regenAll=()=>{
    const nb=rndHsl(); setBase(nb); setLocked({}); setInts({});
    const nc=applyHarm(nb,harmType,effN,{}); refresh(nc,nb,harmType,effN,{});
  };
  const regenOne=idx=>{
    const nc=[...colors]; nc[idx]=rndHsl(); const nl={...locked}; delete nl[idx];
    setLocked(nl); refresh(nc,null,null,null,nl);
  };
  const toggleLock=idx=>{
    const nl={...locked}; nl[idx]?delete nl[idx]:nl[idx]=colors[idx];
    setLocked(nl); setFlags(computeFlags(colors,harmType,base[0],effN,nl));
  };
  const onPicker=hex=>{
    const hsl=hex2hsl(hex); setBase(hsl);
    const nc=applyHarm(hsl,harmType,effN,locked); refresh(nc,hsl,null,null,locked);
  };
  const onHarmChange=type=>{
    const fc=HARM[type].fixed,n=fc??count,nl={};
    Object.entries(locked).forEach(([k,v])=>{ if(+k<n) nl[k]=v; });
    setHarmType(type);setLocked(nl);
    const nc=applyHarm(base,type,n,nl); refresh(nc,null,type,n,nl);
    setSaveName(`${HARM[type].label} · ${new Date().toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})}`);
  };
  const onCountChange=n=>{
    setCount(n); const nl={};
    Object.entries(locked).forEach(([k,v])=>{ if(+k<n) nl[k]=v; });
    setLocked(nl); const nc=applyHarm(base,harmType,n,nl); refresh(nc,null,null,n,nl);
  };
  const setInt=(idx,v)=>setInts(p=>({...p,[idx]:v}));

  const loadSaved=async()=>{
    try{ const res=await window.storage.list('lx:'); if(!res?.keys?.length){setSaved([]);return;}
      const p=[]; for(const k of res.keys){ try{const r=await window.storage.get(k);if(r)p.push({key:k,...JSON.parse(r.value)});}catch{} } setSaved(p.reverse());
    }catch{setSaved([]);}
  };
  const savePal=async()=>{
    try{ await window.storage.set(`lx:${Date.now()}`,JSON.stringify({colors,harmType,name:saveName||'sin nombre'})); flash('✓ paleta guardada'); loadSaved(); }catch{flash('× error');}
  };
  const delPal=async k=>{ try{await window.storage.delete(k);loadSaved();}catch{} };
  const usePal=p=>{ setColors(p.colors);setHarmType(p.harmType);setLocked({});setFlags({});setInts({});setShowSaved(false);setSeed(Math.floor(Math.random()*99999)); };
  useEffect(()=>{ loadSaved(); },[]);

  const exportPNG=()=>{ if(!cvs.current)return; const a=document.createElement('a'); a.download=`scene-light-${Date.now()}.png`; a.href=cvs.current.toDataURL(); a.click(); };

  const hasFlag=Object.keys(flags).length>0;
  const baseHex=hsl2hex(...base);

  return(
    <div style={{background:'#000',minHeight:'100vh',color:'#fff',fontFamily:FONT,padding:'14px',display:'flex',flexDirection:'column',gap:'10px'}}>

      {/* Header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:'8px'}}>
        <div>
          <div style={{fontSize:'14px',color:CYAN,letterSpacing:'5px',fontWeight:'bold',textShadow:`0 0 16px ${CYAN},0 0 32px rgba(0,160,250,.4)`}}>⬡ SCENE LIGHT</div>
          <div style={{...lbl,marginTop:'3px'}}>generador de paletas · iluminación escénica</div>
        </div>
        <div style={{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap'}}>
          {hasFlag&&<span style={{fontSize:'10px',color:RED,border:`1px solid ${RED}`,padding:'3px 9px',borderRadius:'3px',boxShadow:`0 0 10px rgba(255,29,29,.3)`}}>⚠ armonía comprometida</span>}
          {msg&&<span style={{fontSize:'10px',color:CYAN,fontStyle:'italic'}}>{msg}</span>}
        </div>
      </div>

      {/* Separator */}
      <div style={{height:'1px',background:`linear-gradient(90deg,transparent,${CYAN},transparent)`,boxShadow:`0 0 10px rgba(0,160,250,.5)`}}/>

      {/* Canvas */}
      <div style={{position:'relative'}}>
        <canvas ref={cvs} width={960} height={540}
          style={{width:'100%',aspectRatio:'16/9',display:'block',borderRadius:'4px',
            border:`1px solid ${mirror?CYAN:'rgba(255,255,255,.1)'}`,
            boxShadow:mirror?`0 0 18px rgba(0,160,250,.35)`:'none',transition:'border-color .3s,box-shadow .3s'}}/>
        <div style={{position:'absolute',top:'8px',left:'10px',fontSize:'9px',color:'rgba(0,160,250,.75)',letterSpacing:'2px',textTransform:'uppercase',textShadow:`0 0 8px ${CYAN}`,pointerEvents:'none'}}>
          {HARM[harmType].label} · {effN} col · {mode}
        </div>
      </div>

      {/* Mode bar */}
      <div style={{...panStyle,display:'flex',gap:'5px',flexWrap:'wrap',alignItems:'center'}}>
        <span style={lbl}>modo</span>
        {[['focos','◉ focos'],['haces','╎ haces'],['campos','▬ campos'],['zonas','◌ zonas'],['bloques','▪ bloques']].map(([k,lb])=>(
          <button key={k} style={btnStyle(mode===k)} onClick={()=>setMode(k)}>{lb}</button>
        ))}
        <div style={{marginLeft:'auto',display:'flex',gap:'5px',flexWrap:'wrap'}}>
          <button style={btnStyle(mirror)} onClick={()=>setMirror(v=>!v)}>⇔ espejo</button>
          <button style={btnStyle()} onClick={()=>setSeed(Math.floor(Math.random()*99999))}>↺ nueva imagen</button>
          <button style={btnStyle(false,false,{color:CYAN,border:`1px solid ${CYAN}`,boxShadow:`0 0 10px rgba(0,160,250,.25)`})} onClick={exportPNG}>⤓ PNG</button>
        </div>
      </div>

      {/* Harmony bar */}
      <div style={{...panStyle,display:'flex',gap:'8px',flexWrap:'wrap',alignItems:'center'}}>
        <span style={lbl}>armonía</span>
        <select style={{background:'#0a0a0a',border:'1px solid rgba(255,255,255,.15)',color:'#fff',fontFamily:FONT,fontSize:'11px',padding:'5px 8px',borderRadius:'3px',cursor:'pointer',letterSpacing:'.4px'}}
          value={harmType} onChange={e=>onHarmChange(e.target.value)}>
          {Object.entries(HARM).map(([k,v])=><option key={k} value={k}>{v.label}{v.fixed?` · ${v.fixed}`:''}</option>)}
        </select>
        {fixedN===null&&<>
          <span style={lbl}>n</span>
          <input type="range" min={2} max={8} value={count} style={{accentColor:CYAN,width:'70px',cursor:'pointer'}} onChange={e=>onCountChange(+e.target.value)}/>
          <span style={{fontSize:'12px',color:CYAN,minWidth:'12px'}}>{count}</span>
        </>}
        {/* Base color picker */}
        <div style={{display:'flex',alignItems:'center',gap:'6px',marginLeft:'6px'}}>
          <span style={lbl}>base</span>
          <div style={{position:'relative',width:'28px',height:'22px',flexShrink:0}}>
            <div style={{position:'absolute',inset:0,background:baseHex,borderRadius:'3px',border:`1px solid ${CYAN}`,boxShadow:`0 0 7px rgba(0,160,250,.35)`,pointerEvents:'none'}}/>
            <input type="color" value={baseHex} onChange={e=>onPicker(e.target.value)}
              style={{opacity:0,position:'absolute',inset:0,width:'100%',height:'100%',padding:0,border:'none',cursor:'pointer'}}/>
          </div>
          <span style={{fontSize:'9px',color:'rgba(255,255,255,.35)'}}>{baseHex.toUpperCase()}</span>
        </div>
        <div style={{marginLeft:'auto',display:'flex',gap:'5px'}}>
          <button style={btnStyle(showWheel)} onClick={()=>setShowWheel(true)}>◎ rueda</button>
          <button style={btnStyle()} onClick={regenAll}>⟳ regenerar</button>
        </div>
      </div>

      {/* Swatches */}
      <div style={{display:'flex',gap:'6px',flexWrap:'wrap'}}>
        {colors.map(([h,s,l],i)=>{
          const hex=hsl2hex(h,s,l),isLk=!!locked[i],isFlg=!!flags[i],iv=ints[i]??100;
          return(
            <div key={i} style={{flex:'1',minWidth:'90px',maxWidth:'150px',display:'flex',flexDirection:'column',gap:'6px',
              background:'rgba(255,255,255,.03)',borderRadius:'4px',padding:'8px',
              border:`1px solid ${isFlg?RED:isLk?CYAN:'rgba(255,255,255,.1)'}`,
              boxShadow:isFlg?`0 0 10px rgba(255,29,29,.25)`:isLk?`0 0 8px rgba(0,160,250,.2)`:'none',transition:'border-color .2s,box-shadow .2s'}}>
              <div style={{position:'relative'}}>
                <div style={{height:'44px',background:hex,borderRadius:'3px',border:'1px solid rgba(255,255,255,.06)'}}/>
                {isFlg&&(
                  <div style={{position:'absolute',top:'3px',right:'4px',fontSize:'12px',cursor:'help',lineHeight:1}}
                    onMouseEnter={e=>setTooltip({x:e.clientX,y:e.clientY})}
                    onMouseLeave={()=>setTooltip(null)}>⚠️</div>
                )}
              </div>
              <div style={{fontSize:'10px',color:CYAN,letterSpacing:'.5px',textShadow:`0 0 6px rgba(0,160,250,.4)`}}>{hex.toUpperCase()}</div>
              <div style={{fontSize:'8px',color:'rgba(255,255,255,.28)',lineHeight:'1.6'}}>H:{h}° S:{s}%<br/>L:{l}%</div>
              {/* Intensity */}
              <div>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:'3px'}}>
                  <span style={{...lbl,fontSize:'8px'}}>intensidad</span>
                  <span style={{fontSize:'9px',color:CYAN}}>{iv}%</span>
                </div>
                <input type="range" min={5} max={100} value={iv} style={{accentColor:CYAN,width:'100%',cursor:'pointer',height:'12px'}}
                  onChange={e=>setInt(i,+e.target.value)}/>
              </div>
              <div style={{display:'flex',gap:'4px'}}>
                <button style={{...btnStyle(isLk,false),flex:1,padding:'4px 0',fontSize:'13px',textAlign:'center'}}
                  onClick={()=>toggleLock(i)} title={isLk?'Desbloquear':'Bloquear'}>{isLk?'🔒':'🔓'}</button>
                <button style={{...btnStyle(),flex:1,padding:'4px 0',fontSize:'13px',textAlign:'center'}}
                  onClick={()=>regenOne(i)} title="Regenerar">↺</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Save row */}
      <div style={{...panStyle,display:'flex',gap:'6px',alignItems:'center',flexWrap:'wrap'}}>
        <span style={lbl}>guardar</span>
        <input value={saveName} onChange={e=>setSaveName(e.target.value)}
          style={{flex:1,minWidth:'160px',background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.12)',
            color:'#fff',fontFamily:FONT,fontSize:'10px',padding:'5px 8px',borderRadius:'3px',outline:'none'}}
          placeholder="nombre de la paleta"/>
        <button onClick={savePal}
          style={{background:'rgba(0,160,250,.15)',border:`1px solid ${CYAN}`,color:CYAN,fontFamily:FONT,
            fontSize:'11px',padding:'6px 14px',borderRadius:'3px',cursor:'pointer',letterSpacing:'1px',
            boxShadow:`0 0 14px rgba(0,160,250,.45)`,fontWeight:'bold'}}>✦ guardar</button>
        <button style={btnStyle(showSaved)} onClick={()=>{ setShowSaved(v=>!v); if(!showSaved) loadSaved(); }}>
          {showSaved?'▲':'▼'} guardadas ({saved.length})
        </button>
      </div>

      {/* Saved palettes */}
      {showSaved&&(
        <div style={{...panStyle,display:'flex',flexDirection:'column',gap:'6px'}}>
          <span style={lbl}>paletas guardadas</span>
          {!saved.length
            ?<span style={{fontSize:'11px',color:'rgba(255,255,255,.25)'}}>sin paletas guardadas</span>
            :saved.map(p=>(
              <div key={p.key} style={{display:'flex',alignItems:'center',gap:'8px',background:'rgba(255,255,255,.03)',borderRadius:'3px',padding:'7px 9px',flexWrap:'wrap'}}>
                <div style={{display:'flex',gap:'3px',flexShrink:0}}>
                  {p.colors.map(([h,s,l],j)=><div key={j} style={{width:'18px',height:'18px',background:hsl2hex(h,s,l),borderRadius:'2px'}}/>)}
                </div>
                <span style={{flex:1,fontSize:'10px',color:'rgba(255,255,255,.7)',minWidth:'60px'}}>{p.name}</span>
                <div style={{display:'flex',gap:'4px'}}>
                  <button style={btnStyle()} onClick={()=>usePal(p)}>usar</button>
                  <button style={btnStyle(false,true)} onClick={()=>delPal(p.key)}>✕</button>
                </div>
              </div>
            ))
          }
        </div>
      )}

      {/* Flag tooltip */}
      {tooltip&&(
        <div style={{position:'fixed',top:tooltip.y-38,left:tooltip.x+12,background:'#060606',
          border:`1px solid ${RED}`,color:RED,fontSize:'10px',padding:'5px 10px',borderRadius:'3px',
          zIndex:9999,boxShadow:`0 0 14px rgba(255,29,29,.4)`,pointerEvents:'none',whiteSpace:'nowrap',fontFamily:FONT}}>
          ⚠ color fuera de armonía — desvío &gt;15°
        </div>
      )}

      {/* Chromatic Wheel Modal */}
      {showWheel&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.88)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:500,backdropFilter:'blur(5px)'}}
          onClick={()=>setShowWheel(false)}>
          <div style={{background:'#050510',border:`1px solid ${CYAN}`,borderRadius:'8px',padding:'18px',
            boxShadow:`0 0 28px rgba(0,160,250,.35)`,minWidth:'320px'}}
            onClick={e=>e.stopPropagation()}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'14px'}}>
              <div>
                <div style={{fontSize:'12px',color:CYAN,letterSpacing:'3px',textShadow:`0 0 12px ${CYAN}`}}>RUEDA CROMÁTICA</div>
                <div style={{...lbl,marginTop:'3px'}}>{HARM[harmType].label} · {effN} colores</div>
              </div>
              <button style={btnStyle(false,false,{padding:'4px 10px'})} onClick={()=>setShowWheel(false)}>✕ cerrar</button>
            </div>
            <canvas ref={wCvs} width={290} height={290} style={{display:'block',margin:'0 auto',borderRadius:'50%',boxShadow:`0 0 20px rgba(0,0,0,.6)`}}/>
            {/* Legend */}
            <div style={{display:'flex',gap:'12px',flexWrap:'wrap',justifyContent:'center',marginTop:'14px',paddingTop:'12px',borderTop:'1px solid rgba(255,255,255,.07)'}}>
              {colors.map(([h,s,l],i)=>(
                <div key={i} style={{display:'flex',alignItems:'center',gap:'5px'}}>
                  <div style={{width:'10px',height:'10px',borderRadius:'50%',background:hsl2hex(h,s,l),
                    border:`1.5px solid ${flags[i]?RED:locked[i]?CYAN:'rgba(255,255,255,.25)'}`}}/>
                  <span style={{fontSize:'9px',color:flags[i]?RED:locked[i]?CYAN:'rgba(255,255,255,.45)'}}>
                    {i+1}{locked[i]?' 🔒':''}{flags[i]?' ⚠':''}
                  </span>
                </div>
              ))}
              <div style={{display:'flex',alignItems:'center',gap:'5px',opacity:.5}}>
                <div style={{width:'14px',height:'0',borderTop:'1px dashed rgba(255,255,255,.5)'}}/>
                <span style={{fontSize:'8px',color:'rgba(255,255,255,.4)'}}>pos. esperada</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
