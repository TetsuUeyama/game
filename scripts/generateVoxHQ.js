/**
 * HQ Voxel Character Generator v2
 * node scripts/generateVoxHQ.js
 *
 * 参考: リュウ/テリー風 — 角張った断面、筋肉の凹凸、V字テーパー
 * VOX: X=左右, Y=奥行(-Y=前), Z=上
 */
const fs = require("fs");
const path = require("path");
const OUT = path.join(__dirname, "..", "public", "box2");

// ========================================================================
// Palette
// ========================================================================
function makePalette() {
  const p = new Uint8Array(256 * 4);
  const s = (i,r,g,b) => { const o=(i-1)*4; p[o]=r;p[o+1]=g;p[o+2]=b;p[o+3]=255; };
  // Skin tones (light → dark)
  s(1, 235,190,148); s(2, 215,170,130); s(3, 190,148,110); s(4, 160,120,85);
  // Hair
  s(5, 45,32,22); s(6, 72,52,35); s(7, 100,78,55);
  // Face detail
  s(8, 255,255,255); // sclera
  s(9, 22,18,14);    // pupil
  s(10, 48,36,28);   // eyebrow
  s(11, 185,72,72);  // lip
  s(12, 150,52,52);  // lip dark
  s(13, 242,242,242); // teeth
  // Jersey
  s(14, 45,95,220);  // primary
  s(15, 255,255,255); // secondary/trim
  s(16, 32,70,170);  // dark
  // Shorts
  s(17, 45,95,220); s(18, 32,70,170);
  // Shoe
  s(19, 238,238,238); s(20, 200,45,45); s(21, 55,55,55);
  // Sock, wristband, headband
  s(22, 238,238,238); s(23, 200,45,45); s(24, 200,45,45);
  s(25, 225,182,140); // skin highlight
  return p;
}

// ========================================================================
// VOX writer + utils
// ========================================================================
function writeVox(fp, sx, sy, sz, voxels, pal) {
  const xSz = 4+voxels.length*4;
  const cSz = (12+12)+(12+xSz)+(12+1024); // SIZE+XYZI+RGBA chunks
  const buf = Buffer.alloc(8+12+cSz); let o=0;
  const ws=s=>{buf.write(s,o,"ascii");o+=4}, w32=v=>{buf.writeUInt32LE(v,o);o+=4}, w8=v=>{buf.writeUInt8(v,o);o+=1};
  ws("VOX ");w32(150);ws("MAIN");w32(0);w32(cSz);
  ws("SIZE");w32(12);w32(0);w32(sx);w32(sy);w32(sz);
  ws("XYZI");w32(xSz);w32(0);w32(voxels.length);
  for(const v of voxels){w8(v.x);w8(v.y);w8(v.z);w8(v.colorIndex);}
  ws("RGBA");w32(1024);w32(0);
  for(let i=0;i<1024;i++)w8(pal[i]||0);
  fs.writeFileSync(fp,buf);
  console.log(`  ${path.relative(OUT,fp)}: ${sx}x${sy}x${sz}, ${voxels.length} voxels`);
}
function dedup(v){const m=new Map();for(const x of v)m.set(`${x.x},${x.y},${x.z}`,x);return[...m.values()];}
function normalize(v){
  if(!v.length)return{voxels:[],sx:1,sy:1,sz:1};
  let a=1e9,b=1e9,c=1e9,d=-1e9,e=-1e9,f=-1e9;
  for(const x of v){a=Math.min(a,x.x);b=Math.min(b,x.y);c=Math.min(c,x.z);d=Math.max(d,x.x);e=Math.max(e,x.y);f=Math.max(f,x.z);}
  return{voxels:v.map(x=>({x:x.x-a,y:x.y-b,z:x.z-c,colorIndex:x.colorIndex})),sx:d-a+1,sy:e-b+1,sz:f-c+1};
}
function lerp(a,b,t){return a+(b-a)*t;}

// ========================================================================
// Profile interpolation — 角張った断面で体を構築
// keyframe: [t, halfW, halfD, frontBump, power(超楕円指数)]
// power=2: 楕円, 3-4: 角丸四角形(参考画像のスタイル)
// ========================================================================
function interpProfile(kf, t) {
  for (let i=0;i<kf.length-1;i++) {
    if (t>=kf[i][0] && t<=kf[i+1][0]) {
      const lt=(t-kf[i][0])/(kf[i+1][0]-kf[i][0]);
      return { hw:lerp(kf[i][1],kf[i+1][1],lt), hd:lerp(kf[i][2],kf[i+1][2],lt),
               fb:lerp(kf[i][3],kf[i+1][3],lt), pw:lerp(kf[i][4],kf[i+1][4],lt) };
    }
  }
  const l=kf[kf.length-1];
  return{hw:l[1],hd:l[2],fb:l[3],pw:l[4]};
}

/** 超楕円テスト: |x/a|^p + |y/b|^p <= 1 */
function superEllipseInside(x, y, hw, hd, pw) {
  return Math.pow(Math.abs(x/hw),pw) + Math.pow(Math.abs(y/hd),pw) <= 1.0;
}

/** 筋肉バンプ: 楕円体の内部判定 */
function inBump(x,y,z, bumps) {
  for (const b of bumps) {
    const dx=(x-b[0])/b[3], dy=(y-b[1])/b[4], dz=(z-b[2])/b[5];
    if (dx*dx+dy*dy+dz*dz<=1.0) return true;
  }
  return false;
}

// ========================================================================
// TORSO — V字テーパー + 胸筋/三角筋バンプ
// ========================================================================
function generateTorso() {
  const H = 40;
  const KF = [
    // [t,    halfW, halfD, frontBump, power]
    [0.00,   11,    7.0,   0,    3.2],  // waist bottom
    [0.08,   11,    7.0,   0,    3.2],  // waist
    [0.25,   12,    7.5,   1.0,  3.0],  // abs
    [0.45,   14,    7.5,   2.5,  2.8],  // lower chest
    [0.60,   15,    7.5,   2.0,  2.6],  // upper chest
    [0.72,   15.5,  7.0,   1.0,  2.6],  // shoulder
    [0.82,   14,    6.5,   0.5,  2.5],  // above shoulder
    [0.88,   6.5,   5.0,   0,    2.2],  // neck base
    [1.00,   5.5,   4.5,   0,    2.0],  // neck top
  ];
  // 筋肉バンプ: [cx,cy,cz, rx,ry,rz]
  const bumps = [
    [-6, -6, H*0.52, 5, 3.5, 4],   // left pec
    [ 6, -6, H*0.52, 5, 3.5, 4],   // right pec
    [-15, 0, H*0.72, 3.5, 3, 4],   // left deltoid
    [ 15, 0, H*0.72, 3.5, 3, 4],   // right deltoid
    [-12, 3, H*0.40, 3, 3, 5],     // left lat
    [ 12, 3, H*0.40, 3, 3, 5],     // right lat
  ];
  const v = [];
  for (let z=0; z<H; z++) {
    const t = z/(H-1);
    const {hw,hd,fb,pw} = interpProfile(KF, t);
    for (let x=Math.floor(-hw-5);x<=Math.ceil(hw+5);x++)
      for (let y=Math.floor(-hd-fb-5);y<=Math.ceil(hd+5);y++) {
        const adjD = y<0 ? hd+fb : hd;
        const inside = superEllipseInside(x, y<0?y/((hd+fb)/hd):y, hw, hd, pw)
          || (fb>0 && y<0 && superEllipseInside(x, y, hw, adjD, pw));
        if (!inside && !inBump(x,y,z,bumps)) continue;
        // Color
        let c = 14; // jersey
        // Armhole: sides above chest
        if (t>0.45 && Math.pow(Math.abs(x/hw),pw)>0.55) c=1; // skin
        // V-neck
        if (t>0.65 && y<-hd*0.4 && Math.abs(x)<5+(t-0.65)*15) c=1;
        // Neck
        if (t>0.86) c = (y>1)?3:2;
        // Side stripe
        if (c===14 && Math.pow(Math.abs(x/hw),pw)>0.75 && t<0.72) c=15;
        // Bottom/top trim
        if (c===14 && (t<0.03||Math.abs(t-0.72)<0.02)) c=15;
        // Skin shading on exposed areas
        if (c===1) {
          if (y>0) c=2; // back side darker
          if (Math.abs(x)>hw*0.8) c=2; // outer sides
          if (inBump(x,y,z,bumps) && c<=2) c=25; // muscle highlight
        }
        v.push({x,y,z,colorIndex:c});
      }
  }
  return normalize(dedup(v));
}

// ========================================================================
// HIP / SHORTS
// ========================================================================
function generateHip() {
  const H = 16;
  const KF = [
    [0.00, 10, 7, 0, 3.0],
    [0.30, 11, 7, 0, 3.0],
    [0.60, 12, 7, 0, 3.0],
    [1.00, 11, 7, 0, 3.2],
  ];
  const v = [];
  for (let z=0;z<H;z++) {
    const t=z/(H-1), {hw,hd,pw}=interpProfile(KF,t);
    for (let x=Math.floor(-hw-1);x<=Math.ceil(hw+1);x++)
      for (let y=Math.floor(-hd-1);y<=Math.ceil(hd+1);y++) {
        if (!superEllipseInside(x,y,hw,hd,pw)) continue;
        let c=17;
        if (t>0.85) c=18; // waistband
        if (t<0.08) c=18; // bottom trim
        v.push({x,y,z,colorIndex:c});
      }
  }
  return normalize(dedup(v));
}

// ========================================================================
// UPPER ARM — 三角筋キャップ + 上腕二頭筋
// ========================================================================
function generateUpperArm() {
  const H = 22;
  const KF = [
    [0.00, 5.0, 4.5, 0, 2.5],  // elbow
    [0.30, 5.5, 5.0, 0, 2.5],
    [0.55, 6.5, 5.5, 0.8, 2.5], // bicep peak
    [0.75, 7.0, 6.0, 0.5, 2.5], // deltoid
    [1.00, 6.5, 5.5, 0, 2.5],   // shoulder cap
  ];
  const bumps = [
    [0, -2, H*0.55, 4, 3, 4],  // bicep
    [0, 2, H*0.45, 3.5, 3, 4], // tricep
  ];
  const v = [];
  for (let z=0;z<H;z++) {
    const t=z/(H-1), {hw,hd,fb,pw}=interpProfile(KF,t);
    for (let x=Math.floor(-hw-4);x<=Math.ceil(hw+4);x++)
      for (let y=Math.floor(-hd-fb-4);y<=Math.ceil(hd+4);y++) {
        const adjD=y<0?hd+fb:hd;
        if (!superEllipseInside(x,y,hw,adjD,pw) && !inBump(x,y,z,bumps)) continue;
        let c = (y>2)?3:(y<-3)?25:1;
        if (inBump(x,y,z,bumps)) c=25;
        v.push({x,y,z,colorIndex:c});
      }
  }
  return normalize(dedup(v));
}

// ========================================================================
// FOREARM
// ========================================================================
function generateForearm() {
  const H = 18;
  const KF = [
    [0.00, 4.0, 3.5, 0, 2.3],
    [0.40, 5.0, 4.5, 0, 2.5],
    [0.70, 5.5, 4.5, 0.5, 2.5],
    [1.00, 5.0, 4.5, 0, 2.5],
  ];
  const v = [];
  for (let z=0;z<H;z++) {
    const t=z/(H-1), {hw,hd,fb,pw}=interpProfile(KF,t);
    for (let x=Math.floor(-hw-1);x<=Math.ceil(hw+1);x++)
      for (let y=Math.floor(-hd-fb-1);y<=Math.ceil(hd+1);y++) {
        if (!superEllipseInside(x,y,hw,y<0?hd+fb:hd,pw)) continue;
        let c=(y>2)?3:(y<-2)?25:1;
        v.push({x,y,z,colorIndex:c});
      }
  }
  return normalize(dedup(v));
}

// ========================================================================
// HAND — 拳型（指の溝、親指）
// ========================================================================
function generateHand() {
  const v = [];
  // 拳本体 (超楕円断面)
  for (let z=0;z<10;z++)
    for (let x=-4;x<=4;x++)
      for (let y=-3;y<=3;y++) {
        if (Math.pow(Math.abs(x/4.5),2.8)+Math.pow(Math.abs(y/3.5),2.8)>1) continue;
        let c=1;
        // 指の溝 (前面、z=3-7で縦線)
        if (y<=-2 && z>=2 && z<=7 && (x===-2||x===0||x===2)) c=3;
        // ナックル (前面上部)
        if (y<=-2 && z>=7) c=25;
        // 手の甲
        if (y>=2) c=2;
        v.push({x,y,z,colorIndex:c});
      }
  // 親指
  for (let z=2;z<=7;z++)
    for (let y=-2;y<=1;y++) {
      v.push({x:-5,y,z,colorIndex:2});
      if (z>=3&&z<=6) v.push({x:-6,y:y<0?y:0,z,colorIndex:3});
    }
  return normalize(dedup(v));
}

// ========================================================================
// THIGH — 大腿四頭筋
// ========================================================================
function generateThigh() {
  const H = 28;
  const KF = [
    [0.00, 6.0, 5.5, 0, 2.5],  // knee
    [0.25, 6.5, 6.0, 0, 2.5],
    [0.55, 7.5, 7.0, 0.5, 2.6], // mid
    [0.80, 8.5, 7.5, 0.5, 2.8], // upper
    [1.00, 8.0, 7.0, 0, 3.0],   // hip connection
  ];
  const v = [];
  for (let z=0;z<H;z++) {
    const t=z/(H-1), {hw,hd,fb,pw}=interpProfile(KF,t);
    for (let x=Math.floor(-hw-1);x<=Math.ceil(hw+1);x++)
      for (let y=Math.floor(-hd-fb-1);y<=Math.ceil(hd+1);y++) {
        if (!superEllipseInside(x,y,hw,y<0?hd+fb:hd,pw)) continue;
        // Top 40%: shorts, bottom: skin
        let c;
        if (t>0.60) { c=17; if(t>0.92) c=18; }
        else if (t>0.55) c=18; // trim
        else { c=(y>3)?3:(y<-3)?25:1; }
        v.push({x,y,z,colorIndex:c});
      }
  }
  return normalize(dedup(v));
}

// ========================================================================
// SHIN — ふくらはぎ
// ========================================================================
function generateShin() {
  const H = 26;
  const KF = [
    [0.00, 5.0, 4.5, 0, 2.3],  // ankle
    [0.15, 5.0, 4.5, 0, 2.3],
    [0.40, 5.5, 5.5, 0.8, 2.5], // calf peak
    [0.65, 5.5, 5.0, 0.3, 2.5],
    [1.00, 6.0, 5.5, 0, 2.5],   // knee
  ];
  const v = [];
  for (let z=0;z<H;z++) {
    const t=z/(H-1), {hw,hd,fb,pw}=interpProfile(KF,t);
    for (let x=Math.floor(-hw-1);x<=Math.ceil(hw+1);x++)
      for (let y=Math.floor(-hd-fb-1);y<=Math.ceil(hd+1);y++) {
        if (!superEllipseInside(x,y,hw,y<0?hd+fb:hd,pw)) continue;
        let c;
        if (t<0.25) c=22; // sock
        else c=(y>3)?3:(y<-3)?25:1;
        v.push({x,y,z,colorIndex:c});
      }
  }
  return normalize(dedup(v));
}

// ========================================================================
// SHOE — バスケシューズ（ハイカット）
// ========================================================================
function generateShoe() {
  const v = [];
  for (let z=0;z<12;z++)
    for (let x=-6;x<=6;x++)
      for (let y=-9;y<=6;y++) {
        // Rounded toe
        if (y<-6 && (x*x+(y+6)*(y+6))>38) continue;
        // Taper at top (ankle)
        if (z>8 && Math.abs(x)>5) continue;
        if (z>9 && Math.abs(x)>4) continue;
        if (z>10 && (Math.abs(x)>3||y>4||y<-7)) continue;
        // Basic outline
        const maxX = z>6 ? 6-(z-6)*0.5 : 6;
        if (Math.abs(x)>maxX) continue;

        let c=19; // shoe main
        if (z<=1) c=21; // sole
        else if (z===2) c=21; // midsole
        else if (z>=3 && z<=5 && Math.abs(x)>=4 && y>-5 && y<3) c=20; // swoosh
        else if (z>=8) c=19; // ankle collar
        if (z>=2 && z<=4 && y<-5) c=20; // toe cap accent
        v.push({x,y,z,colorIndex:c});
      }
  return normalize(dedup(v));
}

// ========================================================================
// HEAD — 顎ライン + 眉骨 + 頬骨
// ========================================================================
const HEAD_R = 18;
const HEAD_SY = 0.85;
const HEAD_SZ = 1.05;
const FACE_SURFACE_Y = -Math.floor(HEAD_R * HEAD_SY); // -15
const FACE_Y = FACE_SURFACE_Y - 1; // -16
const EYE_Z = HEAD_R + 3;
const BROW_Z = HEAD_R + 6;
const NOSE_Z = HEAD_R - 1;
const MOUTH_Z = HEAD_R - 4;

const HQ_GRID = { mnX:-24, mxX:24, mnY:-22, mxY:22, mnZ:-5, mxZ:50 };
function normalizeToHeadGrid(voxels) {
  const g=HQ_GRID, ox=-g.mnX, oy=-g.mnY, oz=-g.mnZ;
  const sx=g.mxX-g.mnX+1, sy=g.mxY-g.mnY+1, sz=g.mxZ-g.mnZ+1;
  const out=[];
  for (const v of voxels) {
    const nx=v.x+ox, ny=v.y+oy, nz=v.z+oz;
    if (nx>=0&&nx<sx&&ny>=0&&ny<sy&&nz>=0&&nz<sz)
      out.push({x:nx,y:ny,z:nz,colorIndex:v.colorIndex});
  }
  return {voxels:out,sx,sy,sz};
}

function headBase() {
  const v=[], R=HEAD_R;
  for (let x=-R-3;x<=R+3;x++)
    for (let y=-R;y<=R;y++)
      for (let z=-R;z<=R;z++) {
        const dz=z;
        // 顎テーパー: 中心以下で幅を狭める
        let jawX=1.0, jawY=1.0;
        if (dz<-2) {
          const jt=(-dz-2)/(R-2);
          jawX = 1.0-jt*0.35; // 顎に向かって35%狭く
          jawY = 1.0-jt*0.15;
        }
        // 超楕円ベース (角張った頭)
        const nx=x/(R*jawX), ny=y/(R*HEAD_SY*jawY), nz=dz/(R*HEAD_SZ);
        const pw = dz>0 ? 2.5 : 2.2; // 上は丸め、下は角張り(顎)
        const dist = Math.pow(Math.abs(nx),pw)+Math.pow(Math.abs(ny),pw)+Math.pow(Math.abs(nz),pw);
        if (dist>1.0) continue;
        // 眉骨の突起
        let browBump = 0;
        if (dz>3&&dz<8 && y<-R*HEAD_SY*0.8 && Math.abs(x)<R*0.7) browBump=1.5;
        // 頬骨の幅広
        let cheekBump = 0;
        if (dz>-4&&dz<4 && Math.abs(x)>R*0.6 && y<-R*HEAD_SY*0.3) cheekBump=1;

        // Face area: flatten front surface for overlay parts
        const faceArea = y<FACE_SURFACE_Y+1 && Math.abs(x)<R*0.75 && dz>-8 && dz<10;

        // Skin color
        let c=1;
        if (y>R*HEAD_SY*0.2) c=2; // back darker
        if (Math.abs(nx)>0.75) c=2; // sides
        if (dz<-4) c=3; // lower jaw shadow
        if (dz<-R*0.65) c=4; // chin bottom dark
        if (browBump>0) c=3; // brow shadow
        if (cheekBump>0) c=25; // cheek highlight
        if (faceArea && y<=FACE_SURFACE_Y+2) c=1; // face front clean

        v.push({x,y,z:z+R,colorIndex:c});
      }
  // Neck
  for (let z=-6;z<0;z++)
    for (let x=-7;x<=7;x++)
      for (let y=-6;y<=6;y++)
        if (Math.pow(Math.abs(x/7),2.5)+Math.pow(Math.abs(y/6),2.5)<=1)
          v.push({x,y,z:z+R,colorIndex:3});
  // Ears (larger, more detailed)
  for (let ez=R-3;ez<=R+4;ez++)
    for (const side of [-1,1]) {
      for (let dy=-1;dy<=1;dy++) {
        v.push({x:side*(R+1),y:dy,z:ez,colorIndex:2});
        v.push({x:side*(R+2),y:dy,z:ez,colorIndex:3});
      }
      v.push({x:side*(R+3),y:0,z:ez,colorIndex:4});
    }
  return v;
}

// ========================================================================
// headShell for hair
// ========================================================================
function headShell(x,y,z,inner,outer) {
  const R=HEAD_R, dz=z-R;
  const d2=(x/(R+outer))**2+(y/(R*HEAD_SY+outer))**2+(dz/(R*HEAD_SZ+outer))**2;
  if (d2>1) return false;
  const d2i=(x/(R+inner))**2+(y/(R*HEAD_SY+inner))**2+(dz/(R*HEAD_SZ+inner))**2;
  return d2i>1;
}

// ========================================================================
// EYES
// ========================================================================
function eyesNormal(v) {
  const z=EYE_Z;
  for (const sx of [-1,1]) {
    const cx=sx*6;
    // Sclera (almond shape)
    for (let ex=-2;ex<=2;ex++) for (let ez=-1;ez<=1;ez++) {
      if (Math.abs(ex)===2&&Math.abs(ez)===1) continue;
      v.push({x:cx+ex,y:FACE_Y,z:z+ez,colorIndex:8});
      v.push({x:cx+ex,y:FACE_Y-1,z:z+ez,colorIndex:8});
    }
    // Iris + pupil
    v.push({x:cx,y:FACE_Y,z:z,colorIndex:9});
    v.push({x:cx+sx*-1,y:FACE_Y,z:z,colorIndex:9});
    v.push({x:cx,y:FACE_Y-1,z:z,colorIndex:9});
    // Upper eyelid
    for (let ex=-2;ex<=2;ex++) v.push({x:cx+ex,y:FACE_Y,z:z+2,colorIndex:3});
  }
}
function eyesNarrow(v) {
  const z=EYE_Z;
  for (const sx of [-1,1]) {
    const cx=sx*6;
    for (let ex=-2;ex<=2;ex++) {
      v.push({x:cx+ex,y:FACE_Y,z:z,colorIndex:8});
      v.push({x:cx+ex,y:FACE_Y-1,z:z,colorIndex:8});
    }
    v.push({x:cx,y:FACE_Y,z:z,colorIndex:9});
    v.push({x:cx,y:FACE_Y-1,z:z,colorIndex:9});
    for (let ex=-2;ex<=2;ex++) {
      v.push({x:cx+ex,y:FACE_Y,z:z+1,colorIndex:3});
      v.push({x:cx+ex,y:FACE_Y,z:z-1,colorIndex:2});
    }
  }
}
function eyesWide(v) {
  const z=EYE_Z;
  for (const sx of [-1,1]) {
    const cx=sx*6;
    for (let ex=-2;ex<=2;ex++) for (let ez=-1;ez<=2;ez++) {
      if (Math.abs(ex)===2&&(ez===-1||ez===2)) continue;
      v.push({x:cx+ex,y:FACE_Y,z:z+ez,colorIndex:8});
      v.push({x:cx+ex,y:FACE_Y-1,z:z+ez,colorIndex:8});
    }
    for (let ex=-1;ex<=0;ex++) for (let ez=0;ez<=1;ez++) {
      v.push({x:cx+ex,y:FACE_Y,z:z+ez,colorIndex:9});
      v.push({x:cx+ex,y:FACE_Y-1,z:z+ez,colorIndex:9});
    }
    for (let ex=-1;ex<=1;ex++) v.push({x:cx+ex,y:FACE_Y,z:z+3,colorIndex:3});
  }
}
function eyesAlmond(v) {
  const z=EYE_Z;
  for (const sx of [-1,1]) {
    const cx=sx*6;
    for (let ex=-3;ex<=2;ex++) {
      const h=Math.abs(ex)>=2?0:1;
      for (let ez=-h;ez<=0;ez++) {
        v.push({x:cx+ex,y:FACE_Y,z:z+ez,colorIndex:8});
        v.push({x:cx+ex,y:FACE_Y-1,z:z+ez,colorIndex:8});
      }
    }
    v.push({x:cx,y:FACE_Y,z:z,colorIndex:9});
    v.push({x:cx,y:FACE_Y-1,z:z,colorIndex:9});
    for (let ex=-2;ex<=1;ex++) v.push({x:cx+ex,y:FACE_Y,z:z+1,colorIndex:3});
  }
}
function eyesDetermined(v) {
  const z=EYE_Z;
  for (const sx of [-1,1]) {
    const cx=sx*6;
    for (let ex=-2;ex<=2;ex++) for (let ez=0;ez<=1;ez++) {
      v.push({x:cx+ex,y:FACE_Y,z:z+ez,colorIndex:8});
      v.push({x:cx+ex,y:FACE_Y-1,z:z+ez,colorIndex:8});
    }
    v.push({x:cx,y:FACE_Y,z:z,colorIndex:9});
    v.push({x:cx+sx*-1,y:FACE_Y,z:z,colorIndex:9});
    v.push({x:cx,y:FACE_Y,z:z+1,colorIndex:9});
    v.push({x:cx,y:FACE_Y-1,z:z,colorIndex:9});
    for (let ex=-2;ex<=2;ex++) {
      const lift=(ex*sx>0)?1:0;
      v.push({x:cx+ex,y:FACE_Y,z:z+2+lift,colorIndex:3});
    }
  }
}
function eyesHooded(v) {
  const z=EYE_Z;
  for (const sx of [-1,1]) {
    const cx=sx*6;
    for (let ex=-2;ex<=1;ex++) {
      v.push({x:cx+ex,y:FACE_Y,z:z,colorIndex:8});
      v.push({x:cx+ex,y:FACE_Y-1,z:z,colorIndex:8});
    }
    v.push({x:cx,y:FACE_Y,z:z,colorIndex:9});
    v.push({x:cx,y:FACE_Y-1,z:z,colorIndex:9});
    for (let ex=-2;ex<=2;ex++) {
      v.push({x:cx+ex,y:FACE_Y,z:z+1,colorIndex:2});
      v.push({x:cx+ex,y:FACE_Y-1,z:z+1,colorIndex:2});
    }
  }
}
const EYES=[
  {name:"normal",fn:eyesNormal},{name:"narrow",fn:eyesNarrow},{name:"wide",fn:eyesWide},
  {name:"almond",fn:eyesAlmond},{name:"determined",fn:eyesDetermined},{name:"hooded",fn:eyesHooded},
];

// ========================================================================
// BROWS
// ========================================================================
function browsThick(v) {
  const z=BROW_Z;
  for (const sx of [-1,1]) for (let bx=2;bx<=8;bx++) {
    v.push({x:sx*bx,y:FACE_Y,z,colorIndex:10});
    v.push({x:sx*bx,y:FACE_Y-1,z,colorIndex:10});
    v.push({x:sx*bx,y:FACE_Y,z:z+1,colorIndex:10});
  }
}
function browsThin(v) {
  const z=BROW_Z;
  for (const sx of [-1,1]) for (let bx=3;bx<=8;bx++)
    v.push({x:sx*bx,y:FACE_Y,z,colorIndex:10});
}
function browsAngry(v) {
  const z=BROW_Z;
  for (const sx of [-1,1]) for (let bx=2;bx<=8;bx++) {
    const dip=bx<5?(5-bx):0;
    v.push({x:sx*bx,y:FACE_Y,z:z-dip,colorIndex:10});
    v.push({x:sx*bx,y:FACE_Y-1,z:z-dip,colorIndex:10});
  }
}
function browsArched(v) {
  const z=BROW_Z;
  for (const sx of [-1,1]) for (let bx=3;bx<=8;bx++) {
    const arch=(bx>=5&&bx<=6)?1:0;
    v.push({x:sx*bx,y:FACE_Y,z:z+arch,colorIndex:10});
    v.push({x:sx*bx,y:FACE_Y-1,z:z+arch,colorIndex:10});
  }
}
function browsFlat(v) {
  const z=BROW_Z;
  for (const sx of [-1,1]) for (let bx=3;bx<=8;bx++) {
    v.push({x:sx*bx,y:FACE_Y,z,colorIndex:10});
    v.push({x:sx*bx,y:FACE_Y-1,z,colorIndex:10});
  }
}
function browsRaised(v) {
  const z=BROW_Z+1;
  for (const sx of [-1,1]) for (let bx=3;bx<=8;bx++) {
    const a=(bx>=4&&bx<=6)?1:0;
    v.push({x:sx*bx,y:FACE_Y,z:z+a,colorIndex:10});
  }
}
const BROWS=[
  {name:"thick",fn:browsThick},{name:"thin",fn:browsThin},{name:"angry",fn:browsAngry},
  {name:"arched",fn:browsArched},{name:"flat",fn:browsFlat},{name:"raised",fn:browsRaised},
];

// ========================================================================
// NOSES
// ========================================================================
function noseAverage(v) {
  const z=NOSE_Z;
  v.push({x:0,y:FACE_Y-1,z:z+2,colorIndex:2});
  v.push({x:0,y:FACE_Y-1,z:z+1,colorIndex:2});
  v.push({x:0,y:FACE_Y-2,z:z,colorIndex:2});
  v.push({x:0,y:FACE_Y-2,z:z+1,colorIndex:2});
  v.push({x:-1,y:FACE_Y-1,z,colorIndex:3});
  v.push({x:1,y:FACE_Y-1,z,colorIndex:3});
}
function noseWide(v) {
  const z=NOSE_Z;
  v.push({x:0,y:FACE_Y-1,z:z+2,colorIndex:2});
  v.push({x:0,y:FACE_Y-2,z:z+1,colorIndex:2});
  v.push({x:0,y:FACE_Y-2,z,colorIndex:2});
  for (let x=-2;x<=2;x++) v.push({x,y:FACE_Y-1,z,colorIndex:x===0?2:3});
  v.push({x:-2,y:FACE_Y-1,z:z-1,colorIndex:4});
  v.push({x:2,y:FACE_Y-1,z:z-1,colorIndex:4});
}
function noseNarrow(v) {
  const z=NOSE_Z;
  for (let dz=0;dz<=3;dz++) v.push({x:0,y:FACE_Y-1,z:z+dz,colorIndex:25});
  v.push({x:0,y:FACE_Y-2,z,colorIndex:2});
  v.push({x:0,y:FACE_Y-2,z:z+1,colorIndex:2});
}
function noseBroad(v) {
  const z=NOSE_Z;
  v.push({x:0,y:FACE_Y-1,z:z+1,colorIndex:2});
  v.push({x:0,y:FACE_Y-2,z,colorIndex:2});
  v.push({x:-1,y:FACE_Y-2,z,colorIndex:2});
  v.push({x:1,y:FACE_Y-2,z,colorIndex:2});
  for (let x=-2;x<=2;x++) v.push({x,y:FACE_Y-1,z:z-1,colorIndex:3});
}
function noseButton(v) {
  const z=NOSE_Z;
  v.push({x:0,y:FACE_Y-2,z,colorIndex:25});
  v.push({x:0,y:FACE_Y-2,z:z+1,colorIndex:25});
  v.push({x:-1,y:FACE_Y-1,z,colorIndex:2});
  v.push({x:1,y:FACE_Y-1,z,colorIndex:2});
}
const NOSES=[
  {name:"average",fn:noseAverage},{name:"wide",fn:noseWide},{name:"narrow",fn:noseNarrow},
  {name:"broad",fn:noseBroad},{name:"button",fn:noseButton},
];

// ========================================================================
// MOUTHS
// ========================================================================
function mouthNeutral(v) {
  const z=MOUTH_Z;
  for (let x=-4;x<=4;x++) v.push({x,y:FACE_Y,z,colorIndex:11});
}
function mouthGrin(v) {
  const z=MOUTH_Z;
  for (let x=-4;x<=4;x++) v.push({x,y:FACE_Y,z,colorIndex:11});
  v.push({x:-5,y:FACE_Y,z:z+1,colorIndex:11});
  v.push({x:5,y:FACE_Y,z:z+1,colorIndex:11});
  for (let x=-2;x<=2;x++) v.push({x,y:FACE_Y,z:z+1,colorIndex:13});
}
function mouthSerious(v) {
  const z=MOUTH_Z;
  for (let x=-3;x<=3;x++) v.push({x,y:FACE_Y,z,colorIndex:12});
  v.push({x:-4,y:FACE_Y,z:z-1,colorIndex:12});
  v.push({x:4,y:FACE_Y,z:z-1,colorIndex:12});
}
function mouthSmile(v) {
  const z=MOUTH_Z;
  for (let x=-5;x<=5;x++) v.push({x,y:FACE_Y,z,colorIndex:11});
  v.push({x:-6,y:FACE_Y,z:z+1,colorIndex:11});
  v.push({x:6,y:FACE_Y,z:z+1,colorIndex:11});
  for (let x=-3;x<=3;x++) v.push({x,y:FACE_Y,z:z+1,colorIndex:13});
}
function mouthOpen(v) {
  const z=MOUTH_Z-1;
  for (let x=-3;x<=3;x++) for (let ez=0;ez<=2;ez++)
    v.push({x,y:FACE_Y,z:z+ez,colorIndex:9});
  for (let x=-4;x<=4;x++) {
    v.push({x,y:FACE_Y,z:z+3,colorIndex:11});
    v.push({x,y:FACE_Y,z:z-1,colorIndex:12});
  }
  for (let x=-2;x<=2;x++) v.push({x,y:FACE_Y,z:z+2,colorIndex:13});
}
function mouthSmirk(v) {
  const z=MOUTH_Z;
  for (let x=-3;x<=3;x++) v.push({x,y:FACE_Y,z,colorIndex:11});
  v.push({x:-4,y:FACE_Y,z:z+1,colorIndex:11});
  v.push({x:-5,y:FACE_Y,z:z+1,colorIndex:11});
}
const MOUTHS=[
  {name:"neutral",fn:mouthNeutral},{name:"grin",fn:mouthGrin},{name:"serious",fn:mouthSerious},
  {name:"smile",fn:mouthSmile},{name:"open",fn:mouthOpen},{name:"smirk",fn:mouthSmirk},
];

// ========================================================================
// HAIRS
// ========================================================================
function hairBuzz(v) {
  const R=HEAD_R;
  for (let x=-R-1;x<=R+1;x++) for (let y=-R;y<=R;y++) for (let z=0;z<=2*R+2;z++) {
    if (z<R+2) continue;
    if (!headShell(x,y,z,0,1.0)) continue;
    v.push({x,y,z,colorIndex:5});
  }
}
function hairShort(v) {
  const R=HEAD_R;
  for (let x=-R-2;x<=R+2;x++) for (let y=-R;y<=R;y++) for (let z=0;z<=2*R+5;z++) {
    if (z<R-2) continue;
    if (!headShell(x,y,z,0,2.5)) continue;
    if (y<-R*HEAD_SY*0.6&&z<R+4) continue;
    const c=(z>R+R*HEAD_SZ*0.5)?7:((x+y+z)%3===0?6:5);
    v.push({x,y,z,colorIndex:c});
  }
}
function hairFade(v) {
  const R=HEAD_R;
  for (let x=-R-2;x<=R+2;x++) for (let y=-R;y<=R;y++) for (let z=0;z<=2*R+4;z++) {
    if (z<R) continue;
    if (!headShell(x,y,z,0,2.0)) continue;
    if (y<-R*HEAD_SY*0.5&&z<R+3) continue;
    const sH=z-R, sX=Math.abs(x)/R;
    if (sX>0.6&&sH<5) continue;
    v.push({x,y,z,colorIndex:sH>8?6:5});
  }
}
function hairFlatTop(v) {
  const R=HEAD_R;
  for (let x=-R-1;x<=R+1;x++) for (let y=-R;y<=R;y++) for (let z=0;z<=2*R+8;z++) {
    if (z<R+2) continue;
    const dz=z-R, nx=x/(R+1), ny=y/(R*HEAD_SY+1);
    if (dz>R*HEAD_SZ&&Math.abs(nx)<0.75&&Math.abs(ny)<0.8&&dz<R*HEAD_SZ+7) {
      v.push({x,y,z,colorIndex:5}); continue;
    }
    if (!headShell(x,y,z,0,1.5)) continue;
    if (y<-R*HEAD_SY*0.6&&z<R+3) continue;
    v.push({x,y,z,colorIndex:5});
  }
}
function hairAfro(v) {
  const R=HEAD_R, aR=R+8;
  for (let x=-aR;x<=aR;x++) for (let y=-aR;y<=aR;y++) for (let z=0;z<=2*R+16;z++) {
    if (z<R-2) continue;
    const dz=z-R;
    if ((x/aR)**2+(y/(aR*0.9))**2+(dz/(aR*1.1))**2>1) continue;
    const nx=x/(R-1),ny=y/((R-1)*HEAD_SY),nz=dz/((R-1)*HEAD_SZ);
    if (nx*nx+ny*ny+nz*nz<1) continue;
    if (y<-R*HEAD_SY*0.4&&z<R+5&&Math.abs(x)<R*0.9) continue;
    v.push({x,y,z,colorIndex:(x+y+z)%3===0?6:5});
  }
}
function hairMohawk(v) {
  const R=HEAD_R;
  for (let x=-R-1;x<=R+1;x++) for (let y=-R-1;y<=R+1;y++) for (let z=0;z<=2*R+10;z++) {
    const dz=z-R;
    if (Math.abs(x)<=3) {
      const mH=R*HEAD_SZ+9, ny=y/(R*HEAD_SY+1);
      if (dz>0&&dz<mH&&ny*ny<1) {
        const maxX=3*(1-dz/mH*0.3);
        if (Math.abs(x)<=maxX) { v.push({x,y,z,colorIndex:dz>mH*0.6?7:6}); continue; }
      }
    }
    if (z>=R&&z<R+3) {
      if (!headShell(x,y,z,0,0.5)) continue;
      if (y<-R*HEAD_SY*0.5&&z<R+2) continue;
      v.push({x,y,z,colorIndex:5});
    }
  }
}
function hairCornrow(v) {
  const R=HEAD_R;
  for (let x=-R-2;x<=R+2;x++) for (let y=-R;y<=R;y++) for (let z=0;z<=2*R+3;z++) {
    if (z<R) continue;
    if (!headShell(x,y,z,0,2.0)) continue;
    if (y<-R*HEAD_SY*0.5&&z<R+3) continue;
    const row=Math.abs(x)%3;
    if (row===1) continue;
    v.push({x,y,z,colorIndex:row===0?5:6});
  }
}
function hairDreads(v) {
  const R=HEAD_R;
  for (let x=-R-2;x<=R+2;x++) for (let y=-R-2;y<=R+2;y++) for (let z=0;z<=2*R+4;z++) {
    if (z<R-4) continue;
    if (!headShell(x,y,z,0,3.0)) continue;
    if (y<-R*HEAD_SY*0.5&&z<R+3&&z>R-2) continue;
    const rope=(Math.abs(x)+Math.abs(y))%4;
    if (rope>=2) continue;
    v.push({x,y,z,colorIndex:rope===0?5:6});
  }
}
function hairHeadband(v) {
  const R=HEAD_R;
  for (let x=-R-1;x<=R+1;x++) for (let y=-R;y<=R;y++) for (let z=0;z<=2*R+3;z++) {
    if (z<R+2) continue;
    if (!headShell(x,y,z,0,1.5)) continue;
    if (y<-R*HEAD_SY*0.5&&z<R+3) continue;
    v.push({x,y,z,colorIndex:5});
  }
  const bZ=R+3;
  for (let x=-R-2;x<=R+2;x++) for (let y=-R;y<=R;y++) {
    const d2=(x/(R+2))**2+(y/(R*HEAD_SY+2))**2;
    if (d2>1||d2<0.85) continue;
    for (let bz=bZ;bz<=bZ+1;bz++) v.push({x,y,z:bz,colorIndex:24});
  }
}
function hairBald(v) {
  const R=HEAD_R;
  for (let x=-R;x<=R;x++) for (let y=-R;y<=R;y++) {
    const z=R+Math.floor(R*HEAD_SZ);
    if (!headShell(x,y,z,-1,0.5)) continue;
    v.push({x,y,z,colorIndex:25});
  }
}
const HAIRS=[
  {name:"buzz",fn:hairBuzz},{name:"short",fn:hairShort},{name:"fade",fn:hairFade},
  {name:"flat_top",fn:hairFlatTop},{name:"afro",fn:hairAfro},{name:"mohawk",fn:hairMohawk},
  {name:"cornrow",fn:hairCornrow},{name:"dreads",fn:hairDreads},{name:"headband",fn:hairHeadband},
  {name:"bald",fn:hairBald},
];

// ========================================================================
// Cheeks + Jaw overlay
// ========================================================================
function cheeksAndJaw(v) {
  const R=HEAD_R;
  for (const sx of [-1,1])
    for (let x=7;x<=10;x++) for (let z=R-2;z<=R+1;z++)
      v.push({x:sx*x,y:FACE_Y+1,z,colorIndex:25});
  for (let x=-8;x<=8;x++)
    v.push({x,y:FACE_Y+1,z:R-7,colorIndex:4});
}

// ========================================================================
// MAIN
// ========================================================================
function ensureDir(d){if(!fs.existsSync(d))fs.mkdirSync(d,{recursive:true});}

function main() {
  const pal = makePalette();
  ensureDir(OUT);

  console.log("\n=== HQ Body Parts ===\n");
  for (const [name,gen] of [
    ["torso",generateTorso],["hip",generateHip],["upper_arm",generateUpperArm],
    ["forearm",generateForearm],["hand",generateHand],["thigh",generateThigh],
    ["shin",generateShin],["shoe",generateShoe],
  ]) {
    const {voxels,sx,sy,sz}=gen();
    writeVox(path.join(OUT,`${name}.vox`),sx,sy,sz,voxels,pal);
  }

  console.log("\n=== HQ Head ===\n");
  const hb=normalizeToHeadGrid(dedup(headBase()));
  writeVox(path.join(OUT,"head_base.vox"),hb.sx,hb.sy,hb.sz,hb.voxels,pal);
  // Combined head for game use
  const combined=dedup([...headBase(),...(()=>{const v=[];hairShort(v);eyesNormal(v);browsThick(v);noseAverage(v);mouthNeutral(v);cheeksAndJaw(v);return v;})()]);
  const ch=normalize(combined);
  writeVox(path.join(OUT,"head.vox"),ch.sx,ch.sy,ch.sz,ch.voxels,pal);

  const cats=[
    {l:"Eyes",d:"eyes",p:"eyes",items:EYES},{l:"Brows",d:"brows",p:"brows",items:BROWS},
    {l:"Noses",d:"noses",p:"nose",items:NOSES},{l:"Mouths",d:"mouths",p:"mouth",items:MOUTHS},
    {l:"Hairs",d:"hairs",p:"hair",items:HAIRS},
  ];
  for (const cat of cats) {
    console.log(`\n=== HQ ${cat.l} ===\n`);
    ensureDir(path.join(OUT,cat.d));
    for (const item of cat.items) {
      const v=[]; item.fn(v);
      const r=normalizeToHeadGrid(dedup(v));
      writeVox(path.join(OUT,cat.d,`${cat.p}_${item.name}.vox`),r.sx,r.sy,r.sz,r.voxels,pal);
    }
  }

  const counts=cats.map(c=>c.items.length);
  console.log("\n=== Summary ===");
  for (const c of cats) console.log(`  ${c.l}: ${c.items.length} (${c.items.map(i=>i.name).join(", ")})`);
  console.log(`  Total: ${counts.reduce((a,b)=>a*b,1).toLocaleString()} combinations`);
}

main();
