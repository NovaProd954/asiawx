// @ts-nocheck
/* verbatim from the original ir-decoder.html, used only to prove V2 is an exact port */
let calibHi=null;
const REALISTIC = [
  [0.00,[4,8,14]],   [0.08,[8,13,20]],   [0.16,[22,29,38]],  [0.28,[58,68,79]],
  [0.40,[112,120,129]],[0.52,[178,183,188]],[0.64,[224,227,229]],[0.74,[248,249,249]],
  [0.84,[214,205,196]],[0.92,[142,125,140]],[1.00,[58,42,58]]
];
function lutColorFrom(stops,t){
  t=Math.min(1,Math.max(0,t));
  for(let i=0;i<stops.length-1;i++){
    const a=stops[i], b=stops[i+1];
    if(t>=a[0] && t<=b[0]){
      const f=(t-a[0])/((b[0]-a[0])||1);
      return [a[1][0]+(b[1][0]-a[1][0])*f, a[1][1]+(b[1][1]-a[1][1])*f, a[1][2]+(b[1][2]-a[1][2])*f];
    }
  }
  return [255,255,255];
}


function colorToIntensity(r,g,b){
  const max=Math.max(r,g,b), min=Math.min(r,g,b), delta=max-min;
  const v=max/255, sat = max===0?0:delta/max;
  if(sat<0.16) return v*0.12;
  let hue;
  if(max===r) hue=60*(((g-b)/delta)%6);
  else if(max===g) hue=60*((b-r)/delta+2);
  else hue=60*((r-g)/delta+4);
  if(hue<0) hue+=360;
  let t;
  if(hue>230){ t = hue>=300 ? 1.0 : 0.92+(hue-230)/70*0.08; }
  else {
    const stops=[[230,0.05],[200,0.15],[180,0.25],[150,0.35],[120,0.45],[90,0.52],[60,0.62],[40,0.72],[20,0.82],[0,0.92]];
    t=stops[stops.length-1][1];
    for(let i=0;i<stops.length-1;i++){
      if(hue<=stops[i][0] && hue>=stops[i+1][0]){
        const span=stops[i][0]-stops[i+1][0]||1;
        const f=(stops[i][0]-hue)/span;
        t=stops[i][1]+f*(stops[i+1][1]-stops[i][1]);
        break;
      }
    }
  }
  t *= (0.5+0.5*v)*(0.6+0.4*sat);
  return Math.min(1,Math.max(0,t));
}

const FALSE_COLOR=[
  [0.00,[5,10,20]],  [0.10,[8,20,50]],   [0.20,[15,60,140]], [0.32,[30,130,175]],
  [0.44,[40,165,140]],[0.55,[80,180,60]],[0.65,[190,210,50]],[0.73,[235,215,40]],
  [0.80,[235,160,30]],[0.87,[220,90,35]],[0.90,[200,40,50]], [0.95,[180,45,150]],
  [1.00,[255,255,255]]
];
const ENHANCED=[[0,[6,8,12]],[0.15,[38,42,48]],[0.30,[92,98,106]],[0.42,[168,173,180]],[0.50,[236,238,240]],[0.52,[70,200,230]],[0.60,[40,120,230]],[0.68,[40,200,90]],[0.76,[250,235,40]],[0.84,[245,130,30]],[0.91,[215,30,40]],[0.96,[140,20,110]],[1,[250,250,255]]];
const PALS={classic:FALSE_COLOR,enhanced:ENHANCED};
const PAL_LUTS={};
for(const k in PALS){const l=new Uint8Array(3072);for(let i=0;i<1024;i++){const c=lutColorFrom(PALS[k],i/1023);l[i*3]=c[0];l[i*3+1]=c[1];l[i*3+2]=c[2];}PAL_LUTS[k]=l;}
function sstep(a,b,x){const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);}
function falseRawField(d,w,h){
  const n=w*h,s=new Float32Array(n);
  for(let i=0;i<n;i++){
    const r=d[i*4],g=d[i*4+1],b=d[i*4+2],mx=Math.max(r,g,b),mn=Math.min(r,g,b);
    if(mx===0) continue;
    let sat=(mx-mn)/mx;
    if(b>=mx) sat*=0.6;
    s[i]=Math.pow((0.299*r+0.587*g+0.114*b)/255,1.3)*(1-sstep(0.10,0.55,sat));
  }
  const B=Math.max(4,Math.round(Math.max(w,h)/56)),gw=Math.ceil(w/B),gh=Math.ceil(h/B);
  const g0=new Float32Array(gw*gh).fill(1);
  for(let y=0;y<h;y++){const row=((y/B)|0)*gw;for(let x=0;x<w;x++){const j=row+((x/B)|0),v=s[y*w+x];if(v<g0[j])g0[j]=v;}}
  const er=new Float32Array(gw*gh);
  for(let y=0;y<gh;y++)for(let x=0;x<gw;x++){let m=1;for(let dy=-2;dy<=2;dy++){const yy=Math.min(gh-1,Math.max(0,y+dy));for(let dx=-2;dx<=2;dx++){const v=g0[yy*gw+Math.min(gw-1,Math.max(0,x+dx))];if(v<m)m=v;}}er[y*gw+x]=m;}
  const bg=boxBlur(boxBlur(er,gw,gh,2),gw,gh,2);
  for(let y=0;y<h;y++){
    const fy=Math.min(gh-1,Math.max(0,(y+0.5)/B-0.5)),y0=Math.floor(fy),y1=Math.min(gh-1,y0+1),ty=fy-y0;
    for(let x=0;x<w;x++){
      const fx=Math.min(gw-1,Math.max(0,(x+0.5)/B-0.5)),x0=Math.floor(fx),x1=Math.min(gw-1,x0+1),tx=fx-x0;
      const a=bg[y0*gw+x0]*(1-tx)+bg[y0*gw+x1]*tx,c=bg[y1*gw+x0]*(1-tx)+bg[y1*gw+x1]*tx;
      const k=0.8*Math.min(0.3,a*(1-ty)+c*ty),i=y*w+x;
      s[i]=Math.max(0,Math.min(1,(s[i]-k)/(1-k)));
    }
  }
  return s;
}
function histHi(arrs){
  const B=512,hist=new Uint32Array(B);let tot=0,n=0;
  for(const a of arrs){for(let i=0;i<a.length;i+=2){tot++;if(a[i]>0.1){hist[Math.min(B-1,(a[i]*B)|0)]++;n++;}}}
  if(n<tot*0.004) return 0.6;
  let c=0;const t=n*0.985;
  for(let i=0;i<B;i++){c+=hist[i];if(c>=t) return Math.max(0.4,Math.min(1,(i+1)/B));}
  return 1;
}

function guided(p,w,h,r,eps){
  const n=w*h,m=boxBlur(p,w,h,r),pp=new Float32Array(n);
  for(let i=0;i<n;i++) pp[i]=p[i]*p[i];
  const mm=boxBlur(pp,w,h,r),a=new Float32Array(n),b=new Float32Array(n);
  for(let i=0;i<n;i++){const v=Math.max(0,mm[i]-m[i]*m[i]),k=v/(v+eps);a[i]=k;b[i]=(1-k)*m[i];}
  const ma=boxBlur(a,w,h,r),mb=boxBlur(b,w,h,r),o=new Float32Array(n);
  for(let i=0;i<n;i++) o[i]=ma[i]*p[i]+mb[i];
  return o;
}
function computeFalseColorRGBA(rawT,w,h,params){
  const th=params.threshFC,ct=params.contrastFC,sf=params.softnessFC||0,H=params.heightFC||0,n=w*h;
  let s=sf>0?guided(rawT,w,h,sf,0.0025):rawT;
  if(H>0){
    const R=Math.max(5,Math.round(Math.max(w,h)*0.045)),M=boxBlur(boxBlur(s,w,h,R),w,h,R);
    const m1=boxBlur(rawT,w,h,3),sq=new Float32Array(n);
    for(let i=0;i<n;i++) sq[i]=rawT[i]*rawT[i];
    const m2=boxBlur(sq,w,h,3),o=new Float32Array(n);
    for(let i=0;i<n;i++){
      const tx=Math.sqrt(Math.max(0,m2[i]-m1[i]*m1[i])),coh=0.6*sstep(0.12,0.6,M[i])+0.4*(1-Math.min(1,tx/0.12));
      o[i]=s[i]*(1-H*0.55*(1-coh));
    }
    s=o;
  }
  const iv=1/(params.hiFC||histHi([rawT])),lut=PAL_LUTS[params.palFC]||PAL_LUTS.classic,out=new Uint8ClampedArray(n*4);
  for(let i=0;i<n;i++){
    let v=Math.min(1,s[i]*iv);
    v=(v-th)/(1-th);
    v=v<0?0:Math.pow(v,1/ct);
    const k=((v>1?1:v)*1023|0)*3,o=i*4;
    out[o]=lut[k];out[o+1]=lut[k+1];out[o+2]=lut[k+2];out[o+3]=255;
  }
  return out;
}



function hash2(x,y){ const n=Math.sin(x*127.1+y*311.7)*43758.5453; return n-Math.floor(n); }
function valueNoise(x,y){
  const xi=Math.floor(x), yi=Math.floor(y), xf=x-xi, yf=y-yi;
  const a=hash2(xi,yi), b=hash2(xi+1,yi), c=hash2(xi,yi+1), d=hash2(xi+1,yi+1);
  const u=xf*xf*(3-2*xf), v=yf*yf*(3-2*yf);
  return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v;
}
function fbm(x,y){
  let total=0, amp=0.55, freq=1, norm=0;
  for(let o=0;o<3;o++){ total+=valueNoise(x*freq,y*freq)*amp; norm+=amp; amp*=0.5; freq*=2.35; }
  return total/norm;
}

function boxBlur(src,w,h,radius){
  if(radius<=0) return src;
  const tmp=new Float32Array(w*h), out=new Float32Array(w*h);
  for(let y=0;y<h;y++){
    let sum=0, cnt=0;
    for(let k=-radius;k<=radius;k++){ const xx=Math.min(w-1,Math.max(0,k)); sum+=src[y*w+xx]; cnt++; }
    for(let x=0;x<w;x++){
      tmp[y*w+x]=sum/cnt;
      const addX=Math.min(w-1,x+radius+1), remX=Math.max(0,x-radius);
      sum += src[y*w+addX] - src[y*w+remX];
    }
  }
  for(let x=0;x<w;x++){
    let sum=0, cnt=0;
    for(let k=-radius;k<=radius;k++){ const yy=Math.min(h-1,Math.max(0,k)); sum+=tmp[yy*w+x]; cnt++; }
    for(let y=0;y<h;y++){
      out[y*w+x]=sum/cnt;
      const addY=Math.min(h-1,y+radius+1), remY=Math.max(0,y-radius);
      sum += tmp[addY*w+x] - tmp[remY*w+x];
    }
  }
  return out;
}


function computeDecodedRGBA(rawT,w,h,params){
  const {thresh,contrast,stormAmt,softness,noiseAmt,reliefAmt,lightDeg,mode}=params;
  const n=w*h;
  let t2=new Float32Array(n);
  for(let i=0;i<n;i++){
    let v=(rawT[i]-thresh)/(1-thresh);
    v=Math.max(0,Math.min(1,v));
    v=Math.pow(v,1/contrast);
    t2[i]=v;
  }
  t2=boxBlur(t2,w,h,softness);
  const t3=new Float32Array(n);
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      const i=y*w+x, base=t2[i];
      const mod=(fbm(x*0.09,y*0.09)-0.5)*noiseAmt*base;
      t3[i]=Math.max(0,Math.min(1,base+mod));
    }
  }
  const lightRad=lightDeg*Math.PI/180, lx=Math.cos(lightRad), ly=Math.sin(lightRad);
  const out=new Uint8ClampedArray(w*h*4);
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      const i=y*w+x;
      const xL=t3[y*w+Math.max(0,x-1)], xR=t3[y*w+Math.min(w-1,x+1)];
      const yU=t3[Math.max(0,y-1)*w+x], yD=t3[Math.min(h-1,y+1)*w+x];
      const dx=(xR-xL)*reliefAmt*6, dy=(yD-yU)*reliefAmt*6;
      let nx=-dx, ny=-dy, nz=1;
      const len=Math.sqrt(nx*nx+ny*ny+nz*nz)||1;
      nx/=len; ny/=len; nz/=len;
      const ndotl=nx*lx+ny*ly+nz*0.82;
      const shade=Math.max(0.25,Math.min(1.3,0.55+0.75*ndotl));
      let tForColor=t3[i];
      if(tForColor>0.74) tForColor=0.74+(tForColor-0.74)*stormAmt;
      let rgb;
      if(mode==='mono'){ const g=tForColor<=0.74? tForColor/0.74*230+15 : 230-((tForColor-0.74)/0.26)*180; rgb=[g,g,g]; }
      else rgb=lutColorFrom(REALISTIC,tForColor);
      const idx=i*4;
      out[idx]=rgb[0]*shade; out[idx+1]=rgb[1]*shade; out[idx+2]=rgb[2]*shade; out[idx+3]=255;
    }
  }
  return out;
}


export {computeDecodedRGBA,computeFalseColorRGBA,colorToIntensity,falseRawField,histHi,boxBlur,fbm,guided};
