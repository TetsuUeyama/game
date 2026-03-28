/**
 * HQ Voxel Character Generator v2（高品質ボクセルキャラクタージェネレーター）
 * node scripts/generateVoxHQ.js で実行
 *
 * 参考: リュウ/テリー風 — 角張った断面、筋肉の凹凸、V字テーパー
 * VOX座標系: X=左右, Y=奥行(-Y=前), Z=上
 */
const fs = require("fs");   // ファイルシステムモジュール
const path = require("path"); // パス操作モジュール
const OUT = path.join(__dirname, "..", "public", "box2"); // 出力先ディレクトリ（public/box2）

// ========================================================================
// Palette（カラーパレット定義）
// ========================================================================
// 256色パレットを作成する関数（各色はRGBA 4バイト）
function makePalette() {
  const p = new Uint8Array(256 * 4); // 256色×4バイト(RGBA)のバッファ
  // ヘルパー: インデックスiにRGB値を設定（1始まりインデックス）
  const s = (i,r,g,b) => { const o=(i-1)*4; p[o]=r;p[o+1]=g;p[o+2]=b;p[o+3]=255; };
  // 肌色（明→暗の4段階）
  s(1, 235,190,148); s(2, 215,170,130); s(3, 190,148,110); s(4, 160,120,85);
  // 髪色（暗い茶色系3段階）
  s(5, 45,32,22); s(6, 72,52,35); s(7, 100,78,55);
  // 顔パーツの色
  s(8, 255,255,255); // 白目（強膜）
  s(9, 22,18,14);    // 瞳孔
  s(10, 48,36,28);   // 眉毛
  s(11, 185,72,72);  // 唇（明）
  s(12, 150,52,52);  // 唇（暗）
  s(13, 242,242,242); // 歯
  // ジャージ色
  s(14, 45,95,220);  // メインカラー（青）
  s(15, 255,255,255); // サブカラー/トリム（白）
  s(16, 32,70,170);  // ダークシェード
  // ショーツ色
  s(17, 45,95,220); s(18, 32,70,170); // メイン・暗色
  // シューズ色
  s(19, 238,238,238); s(20, 200,45,45); s(21, 55,55,55); // 白・赤・暗灰
  // ソックス・リストバンド・ヘッドバンド色
  s(22, 238,238,238); s(23, 200,45,45); s(24, 200,45,45); // 白・赤・赤
  s(25, 225,182,140); // 肌ハイライト
  return p; // パレットバッファを返却
}

// ========================================================================
// VOX writer + utils（VOXファイル書き出し・ユーティリティ関数）
// ========================================================================
// VOXファイルを書き出す関数（ファイルパス・サイズ・ボクセル配列・パレット）
function writeVox(fp, sx, sy, sz, voxels, pal) {
  const xSz = 4+voxels.length*4; // XYZIチャンクのコンテンツサイズ（ボクセル数4バイト + 各ボクセル4バイト）
  const cSz = (12+12)+(12+xSz)+(12+1024); // 全チャンクサイズ（SIZE+XYZI+RGBA、各チャンクヘッダ12バイト含む）
  const buf = Buffer.alloc(8+12+cSz); let o=0; // バッファ確保（ファイルヘッダ8+MAINチャンクヘッダ12+子チャンク群）
  // ヘルパー: 4文字ASCII書き込み、32bit整数書き込み（LE）、8bit整数書き込み
  const ws=s=>{buf.write(s,o,"ascii");o+=4}, w32=v=>{buf.writeUInt32LE(v,o);o+=4}, w8=v=>{buf.writeUInt8(v,o);o+=1};
  // ファイルヘッダ: "VOX " + バージョン150
  ws("VOX ");w32(150);ws("MAIN");w32(0);w32(cSz);
  // SIZEチャンク: ボクセルグリッドの寸法（X,Y,Z）
  ws("SIZE");w32(12);w32(0);w32(sx);w32(sy);w32(sz);
  // XYZIチャンク: ボクセルデータ（個数 + 各ボクセルのx,y,z,colorIndex）
  ws("XYZI");w32(xSz);w32(0);w32(voxels.length);
  for(const v of voxels){w8(v.x);w8(v.y);w8(v.z);w8(v.colorIndex);} // 各ボクセルの座標とカラーインデックスを書き込み
  // RGBAチャンク: カラーパレット（256エントリ×4バイト = 1024バイト）
  ws("RGBA");w32(1024);w32(0);
  for(let i=0;i<1024;i++)w8(pal[i]||0); // パレットデータをコピー
  fs.writeFileSync(fp,buf); // ファイルに書き出し
  // 出力パスとサイズ情報をコンソールに表示
  console.log(`  ${path.relative(OUT,fp)}: ${sx}x${sy}x${sz}, ${voxels.length} voxels`);
}
// 重複ボクセルを除去する関数（同一座標は後勝ち）
function dedup(v){const m=new Map();for(const x of v)m.set(`${x.x},${x.y},${x.z}`,x);return[...m.values()];}
// ボクセル配列を原点基準に正規化する関数（最小座標を0にシフト、サイズを計算）
function normalize(v){
  if(!v.length)return{voxels:[],sx:1,sy:1,sz:1}; // 空配列の場合は最小サイズで返却
  // 全軸の最小・最大値を計算
  let a=1e9,b=1e9,c=1e9,d=-1e9,e=-1e9,f=-1e9;
  for(const x of v){a=Math.min(a,x.x);b=Math.min(b,x.y);c=Math.min(c,x.z);d=Math.max(d,x.x);e=Math.max(e,x.y);f=Math.max(f,x.z);}
  // 最小値を引いてゼロ基準に変換、サイズを計算して返却
  return{voxels:v.map(x=>({x:x.x-a,y:x.y-b,z:x.z-c,colorIndex:x.colorIndex})),sx:d-a+1,sy:e-b+1,sz:f-c+1};
}
// 線形補間ヘルパー関数（a→bをt(0〜1)で補間）
function lerp(a,b,t){return a+(b-a)*t;}

// ========================================================================
// Profile interpolation（断面プロファイル補間）
// 角張った断面で体を構築するためのキーフレーム補間
// keyframe: [t, halfW, halfD, frontBump, power(超楕円指数)]
// power=2: 楕円, 3-4: 角丸四角形(参考画像のスタイル)
// ========================================================================
// キーフレーム配列から指定位置tの断面パラメータを補間する関数
function interpProfile(kf, t) {
  // tが含まれるキーフレーム区間を探して線形補間
  for (let i=0;i<kf.length-1;i++) {
    if (t>=kf[i][0] && t<=kf[i+1][0]) {
      const lt=(t-kf[i][0])/(kf[i+1][0]-kf[i][0]); // 区間内の相対位置
      // 半幅(hw)、半奥行(hd)、前面バンプ(fb)、超楕円指数(pw)を補間して返却
      return { hw:lerp(kf[i][1],kf[i+1][1],lt), hd:lerp(kf[i][2],kf[i+1][2],lt),
               fb:lerp(kf[i][3],kf[i+1][3],lt), pw:lerp(kf[i][4],kf[i+1][4],lt) };
    }
  }
  // 範囲外の場合は最後のキーフレーム値を使用
  const l=kf[kf.length-1];
  return{hw:l[1],hd:l[2],fb:l[3],pw:l[4]};
}

/** 超楕円テスト: |x/a|^p + |y/b|^p <= 1 かどうかを判定（角丸四角形の内外判定） */
function superEllipseInside(x, y, hw, hd, pw) {
  return Math.pow(Math.abs(x/hw),pw) + Math.pow(Math.abs(y/hd),pw) <= 1.0;
}

/** 筋肉バンプ: 楕円体のリスト内に点が含まれるかを判定する関数 */
function inBump(x,y,z, bumps) {
  for (const b of bumps) {
    // 各楕円体の中心からの正規化距離を計算
    const dx=(x-b[0])/b[3], dy=(y-b[1])/b[4], dz=(z-b[2])/b[5];
    if (dx*dx+dy*dy+dz*dz<=1.0) return true; // 楕円体内部なら真
  }
  return false; // どの楕円体にも含まれない
}

// ========================================================================
// TORSO — 胴体（V字テーパー + 胸筋/三角筋バンプ）
// ========================================================================
// 胴体ボクセルを生成する関数
function generateTorso() {
  const H = 40; // 胴体の高さ（ボクセル数）
  // 断面プロファイルのキーフレーム [t, 半幅, 半奥行, 前面バンプ, 超楕円指数]
  const KF = [
    [0.00,   11,    7.0,   0,    3.2],  // ウエスト下部
    [0.08,   11,    7.0,   0,    3.2],  // ウエスト
    [0.25,   12,    7.5,   1.0,  3.0],  // 腹筋部
    [0.45,   14,    7.5,   2.5,  2.8],  // 胸下部
    [0.60,   15,    7.5,   2.0,  2.6],  // 胸上部
    [0.72,   15.5,  7.0,   1.0,  2.6],  // 肩
    [0.82,   14,    6.5,   0.5,  2.5],  // 肩上
    [0.88,   6.5,   5.0,   0,    2.2],  // 首根元
    [1.00,   5.5,   4.5,   0,    2.0],  // 首上部
  ];
  // 筋肉バンプ定義: [中心X, 中心Y, 中心Z, 半径X, 半径Y, 半径Z]
  const bumps = [
    [-6, -6, H*0.52, 5, 3.5, 4],   // 左胸筋
    [ 6, -6, H*0.52, 5, 3.5, 4],   // 右胸筋
    [-15, 0, H*0.72, 3.5, 3, 4],   // 左三角筋
    [ 15, 0, H*0.72, 3.5, 3, 4],   // 右三角筋
    [-12, 3, H*0.40, 3, 3, 5],     // 左広背筋
    [ 12, 3, H*0.40, 3, 3, 5],     // 右広背筋
  ];
  const v = []; // ボクセル格納配列
  // Z軸（上下）をスライスして各断面を生成
  for (let z=0; z<H; z++) {
    const t = z/(H-1); // 正規化位置（0=下, 1=上）
    const {hw,hd,fb,pw} = interpProfile(KF, t); // 断面パラメータを補間
    // XY平面をスキャンしてボクセルを配置
    for (let x=Math.floor(-hw-5);x<=Math.ceil(hw+5);x++)
      for (let y=Math.floor(-hd-fb-5);y<=Math.ceil(hd+5);y++) {
        const adjD = y<0 ? hd+fb : hd; // 前面方向は前面バンプ分を加算
        // 超楕円内部判定（前面バンプ考慮）
        const inside = superEllipseInside(x, y<0?y/((hd+fb)/hd):y, hw, hd, pw)
          || (fb>0 && y<0 && superEllipseInside(x, y, hw, adjD, pw));
        // 超楕円外かつ筋肉バンプ外ならスキップ
        if (!inside && !inBump(x,y,z,bumps)) continue;
        // 色の決定
        let c = 14; // デフォルト: ジャージ色（青）
        // アームホール: 肩より上の側面部分は肌色
        if (t>0.45 && Math.pow(Math.abs(x/hw),pw)>0.55) c=1;
        // Vネック: 上部前面中央は肌色
        if (t>0.65 && y<-hd*0.4 && Math.abs(x)<5+(t-0.65)*15) c=1;
        // 首: 肌色（前面は明るめ、背面は暗め）
        if (t>0.86) c = (y>1)?3:2;
        // サイドストライプ: ジャージの側面に白ライン
        if (c===14 && Math.pow(Math.abs(x/hw),pw)>0.75 && t<0.72) c=15;
        // 裾/上部トリム: ジャージの端に白ライン
        if (c===14 && (t<0.03||Math.abs(t-0.72)<0.02)) c=15;
        // 肌の陰影処理
        if (c===1) {
          if (y>0) c=2;                              // 背面側は暗い肌色
          if (Math.abs(x)>hw*0.8) c=2;               // 外側も暗い肌色
          if (inBump(x,y,z,bumps) && c<=2) c=25;     // 筋肉バンプ部はハイライト
        }
        v.push({x,y,z,colorIndex:c}); // ボクセルを追加
      }
  }
  return normalize(dedup(v)); // 重複除去＋正規化して返却
}

// ========================================================================
// HIP / SHORTS — 腰/ショーツ部分
// ========================================================================
// 腰（ショーツ）ボクセルを生成する関数
function generateHip() {
  const H = 16; // 高さ（ボクセル数）
  // 断面プロファイル [t, 半幅, 半奥行, 前面バンプ, 超楕円指数]
  const KF = [
    [0.00, 10, 7, 0, 3.0], // 下端
    [0.30, 11, 7, 0, 3.0], // 中間下
    [0.60, 12, 7, 0, 3.0], // 中間上
    [1.00, 11, 7, 0, 3.2], // 上端
  ];
  const v = []; // ボクセル格納配列
  // 各高さでの断面をスキャン
  for (let z=0;z<H;z++) {
    const t=z/(H-1), {hw,hd,pw}=interpProfile(KF,t); // 位置と断面パラメータ
    for (let x=Math.floor(-hw-1);x<=Math.ceil(hw+1);x++)
      for (let y=Math.floor(-hd-1);y<=Math.ceil(hd+1);y++) {
        if (!superEllipseInside(x,y,hw,hd,pw)) continue; // 超楕円外はスキップ
        let c=17; // デフォルト: ショーツ色
        if (t>0.85) c=18; // ウエストバンド（暗色）
        if (t<0.08) c=18; // 裾トリム（暗色）
        v.push({x,y,z,colorIndex:c}); // ボクセル追加
      }
  }
  return normalize(dedup(v)); // 重複除去＋正規化
}

// ========================================================================
// UPPER ARM — 上腕（三角筋キャップ + 上腕二頭筋）
// ========================================================================
// 上腕ボクセルを生成する関数
function generateUpperArm() {
  const H = 22; // 高さ
  // 断面プロファイル
  const KF = [
    [0.00, 5.0, 4.5, 0, 2.5],  // 肘側
    [0.30, 5.5, 5.0, 0, 2.5],  // 中間下
    [0.55, 6.5, 5.5, 0.8, 2.5], // 二頭筋ピーク
    [0.75, 7.0, 6.0, 0.5, 2.5], // 三角筋部
    [1.00, 6.5, 5.5, 0, 2.5],   // 肩キャップ
  ];
  // 筋肉バンプ: 二頭筋と三頭筋
  const bumps = [
    [0, -2, H*0.55, 4, 3, 4],  // 二頭筋（前面）
    [0, 2, H*0.45, 3.5, 3, 4], // 三頭筋（背面）
  ];
  const v = []; // ボクセル格納配列
  // 各断面をスキャン
  for (let z=0;z<H;z++) {
    const t=z/(H-1), {hw,hd,fb,pw}=interpProfile(KF,t);
    for (let x=Math.floor(-hw-4);x<=Math.ceil(hw+4);x++)
      for (let y=Math.floor(-hd-fb-4);y<=Math.ceil(hd+4);y++) {
        const adjD=y<0?hd+fb:hd; // 前面バンプ考慮
        if (!superEllipseInside(x,y,hw,adjD,pw) && !inBump(x,y,z,bumps)) continue; // 外側はスキップ
        // 肌色の決定（背面暗い、前面ハイライト）
        let c = (y>2)?3:(y<-3)?25:1;
        if (inBump(x,y,z,bumps)) c=25; // 筋肉バンプはハイライト色
        v.push({x,y,z,colorIndex:c});
      }
  }
  return normalize(dedup(v)); // 重複除去＋正規化
}

// ========================================================================
// FOREARM — 前腕
// ========================================================================
// 前腕ボクセルを生成する関数
function generateForearm() {
  const H = 18; // 高さ
  // 断面プロファイル
  const KF = [
    [0.00, 4.0, 3.5, 0, 2.3], // 手首側
    [0.40, 5.0, 4.5, 0, 2.5], // 中間
    [0.70, 5.5, 4.5, 0.5, 2.5], // 太い部分
    [1.00, 5.0, 4.5, 0, 2.5], // 肘側
  ];
  const v = [];
  for (let z=0;z<H;z++) {
    const t=z/(H-1), {hw,hd,fb,pw}=interpProfile(KF,t);
    for (let x=Math.floor(-hw-1);x<=Math.ceil(hw+1);x++)
      for (let y=Math.floor(-hd-fb-1);y<=Math.ceil(hd+1);y++) {
        if (!superEllipseInside(x,y,hw,y<0?hd+fb:hd,pw)) continue; // 超楕円外はスキップ
        let c=(y>2)?3:(y<-2)?25:1; // 背面暗い/前面ハイライト/標準肌色
        v.push({x,y,z,colorIndex:c});
      }
  }
  return normalize(dedup(v)); // 重複除去＋正規化
}

// ========================================================================
// HAND — 手（拳型、指の溝と親指付き）
// ========================================================================
// 手（拳）ボクセルを生成する関数
function generateHand() {
  const v = [];
  // 拳本体（超楕円断面でボックス型に近い形状）
  for (let z=0;z<10;z++)
    for (let x=-4;x<=4;x++)
      for (let y=-3;y<=3;y++) {
        // 超楕円による内外判定（指数2.8で角張った形状）
        if (Math.pow(Math.abs(x/4.5),2.8)+Math.pow(Math.abs(y/3.5),2.8)>1) continue;
        let c=1; // デフォルト: 標準肌色
        // 指の溝（前面、z=2〜7の範囲で縦線を暗色に）
        if (y<=-2 && z>=2 && z<=7 && (x===-2||x===0||x===2)) c=3;
        // ナックル（前面上部は肌ハイライト）
        if (y<=-2 && z>=7) c=25;
        // 手の甲（背面は暗い肌色）
        if (y>=2) c=2;
        v.push({x,y,z,colorIndex:c});
      }
  // 親指（左側に突き出す形状）
  for (let z=2;z<=7;z++)
    for (let y=-2;y<=1;y++) {
      v.push({x:-5,y,z,colorIndex:2}); // 親指根元
      if (z>=3&&z<=6) v.push({x:-6,y:y<0?y:0,z,colorIndex:3}); // 親指先端（暗い肌色）
    }
  return normalize(dedup(v)); // 重複除去＋正規化
}

// ========================================================================
// THIGH — 大腿（大腿四頭筋）
// ========================================================================
// 大腿ボクセルを生成する関数
function generateThigh() {
  const H = 28; // 高さ
  // 断面プロファイル
  const KF = [
    [0.00, 6.0, 5.5, 0, 2.5],  // 膝側
    [0.25, 6.5, 6.0, 0, 2.5],  // 中間下
    [0.55, 7.5, 7.0, 0.5, 2.6], // 中間（最も太い部分）
    [0.80, 8.5, 7.5, 0.5, 2.8], // 上部
    [1.00, 8.0, 7.0, 0, 3.0],   // 股関節接続部
  ];
  const v = [];
  for (let z=0;z<H;z++) {
    const t=z/(H-1), {hw,hd,fb,pw}=interpProfile(KF,t);
    for (let x=Math.floor(-hw-1);x<=Math.ceil(hw+1);x++)
      for (let y=Math.floor(-hd-fb-1);y<=Math.ceil(hd+1);y++) {
        if (!superEllipseInside(x,y,hw,y<0?hd+fb:hd,pw)) continue; // 超楕円外はスキップ
        // 色の決定: 上部40%はショーツ、下部は肌色
        let c;
        if (t>0.60) { c=17; if(t>0.92) c=18; } // ショーツ（上端はウエストバンド色）
        else if (t>0.55) c=18;                    // ショーツ裾トリム
        else { c=(y>3)?3:(y<-3)?25:1; }           // 肌色（背面暗/前面ハイライト/標準）
        v.push({x,y,z,colorIndex:c});
      }
  }
  return normalize(dedup(v)); // 重複除去＋正規化
}

// ========================================================================
// SHIN — すね（ふくらはぎ）
// ========================================================================
// すねボクセルを生成する関数
function generateShin() {
  const H = 26; // 高さ
  // 断面プロファイル
  const KF = [
    [0.00, 5.0, 4.5, 0, 2.3],  // 足首側
    [0.15, 5.0, 4.5, 0, 2.3],  // 足首上
    [0.40, 5.5, 5.5, 0.8, 2.5], // ふくらはぎピーク
    [0.65, 5.5, 5.0, 0.3, 2.5], // 中間
    [1.00, 6.0, 5.5, 0, 2.5],   // 膝側
  ];
  const v = [];
  for (let z=0;z<H;z++) {
    const t=z/(H-1), {hw,hd,fb,pw}=interpProfile(KF,t);
    for (let x=Math.floor(-hw-1);x<=Math.ceil(hw+1);x++)
      for (let y=Math.floor(-hd-fb-1);y<=Math.ceil(hd+1);y++) {
        if (!superEllipseInside(x,y,hw,y<0?hd+fb:hd,pw)) continue; // 超楕円外はスキップ
        let c;
        if (t<0.25) c=22;                    // 下部25%: ソックス色
        else c=(y>3)?3:(y<-3)?25:1;           // それ以外: 肌色
        v.push({x,y,z,colorIndex:c});
      }
  }
  return normalize(dedup(v)); // 重複除去＋正規化
}

// ========================================================================
// SHOE — バスケットシューズ（ハイカット）
// ========================================================================
// シューズボクセルを生成する関数
function generateShoe() {
  const v = [];
  // 3重ループでシューズ形状をスキャン
  for (let z=0;z<12;z++)
    for (let x=-6;x<=6;x++)
      for (let y=-9;y<=6;y++) {
        // 丸いつま先: 前面が円弧で削られる
        if (y<-6 && (x*x+(y+6)*(y+6))>38) continue;
        // 上部テーパー（足首部分で幅が狭まる）
        if (z>8 && Math.abs(x)>5) continue;
        if (z>9 && Math.abs(x)>4) continue;
        if (z>10 && (Math.abs(x)>3||y>4||y<-7)) continue;
        // 基本的な外形制限（上に行くほど幅が狭い）
        const maxX = z>6 ? 6-(z-6)*0.5 : 6;
        if (Math.abs(x)>maxX) continue;

        let c=19; // デフォルト: シューズメインカラー（白）
        if (z<=1) c=21;        // ソール（靴底、暗灰色）
        else if (z===2) c=21;  // ミッドソール（暗灰色）
        else if (z>=3 && z<=5 && Math.abs(x)>=4 && y>-5 && y<3) c=20; // スウッシュ（赤アクセント）
        else if (z>=8) c=19;   // アンクルカラー（白）
        if (z>=2 && z<=4 && y<-5) c=20; // つま先キャップアクセント（赤）
        v.push({x,y,z,colorIndex:c});
      }
  return normalize(dedup(v)); // 重複除去＋正規化
}

// ========================================================================
// HEAD — 頭部（顎ライン + 眉骨 + 頬骨）
// ========================================================================
const HEAD_R = 18;                                    // 頭部の基本半径
const HEAD_SY = 0.85;                                 // Y方向（前後）のスケール係数
const HEAD_SZ = 1.05;                                 // Z方向（上下）のスケール係数
const FACE_SURFACE_Y = -Math.floor(HEAD_R * HEAD_SY); // 顔面サーフェスのY位置（-15）
const FACE_Y = FACE_SURFACE_Y - 1;                    // 顔パーツ配置のY位置（-16）
const EYE_Z = HEAD_R + 3;                             // 目のZ位置
const BROW_Z = HEAD_R + 6;                            // 眉のZ位置
const NOSE_Z = HEAD_R - 1;                            // 鼻のZ位置
const MOUTH_Z = HEAD_R - 4;                           // 口のZ位置

// 頭部グリッドの範囲定義（正規化用）
const HQ_GRID = { mnX:-24, mxX:24, mnY:-22, mxY:22, mnZ:-5, mxZ:50 };
// ボクセル座標を頭部グリッドに正規化する関数
function normalizeToHeadGrid(voxels) {
  const g=HQ_GRID, ox=-g.mnX, oy=-g.mnY, oz=-g.mnZ; // オフセット計算（最小値を0にシフト）
  const sx=g.mxX-g.mnX+1, sy=g.mxY-g.mnY+1, sz=g.mxZ-g.mnZ+1; // グリッドサイズ
  const out=[];
  for (const v of voxels) {
    const nx=v.x+ox, ny=v.y+oy, nz=v.z+oz; // オフセット適用
    // グリッド範囲内のボクセルのみ出力
    if (nx>=0&&nx<sx&&ny>=0&&ny<sy&&nz>=0&&nz<sz)
      out.push({x:nx,y:ny,z:nz,colorIndex:v.colorIndex});
  }
  return {voxels:out,sx,sy,sz}; // 正規化されたボクセルとサイズを返却
}

// 頭部ベース（球体＋顎テーパー＋眉骨＋頬骨）を生成する関数
function headBase() {
  const v=[], R=HEAD_R;
  // 3重ループで頭部全体をスキャン
  for (let x=-R-3;x<=R+3;x++)
    for (let y=-R;y<=R;y++)
      for (let z=-R;z<=R;z++) {
        const dz=z; // Z方向のオフセット
        // 顎テーパー: 中心以下で幅を狭める
        let jawX=1.0, jawY=1.0;
        if (dz<-2) {
          const jt=(-dz-2)/(R-2); // 顎の深さに応じたテーパー係数
          jawX = 1.0-jt*0.35;     // X方向（左右）を最大35%狭くする
          jawY = 1.0-jt*0.15;     // Y方向（前後）を最大15%狭くする
        }
        // 超楕円ベースの内外判定（角張った頭部形状）
        const nx=x/(R*jawX), ny=y/(R*HEAD_SY*jawY), nz=dz/(R*HEAD_SZ); // 正規化座標
        const pw = dz>0 ? 2.5 : 2.2; // 上部は丸め、下部は角張り（顎の表現）
        const dist = Math.pow(Math.abs(nx),pw)+Math.pow(Math.abs(ny),pw)+Math.pow(Math.abs(nz),pw);
        if (dist>1.0) continue; // 超楕円外はスキップ
        // 眉骨の突起（顔前面上部を微小に膨らませる）
        let browBump = 0;
        if (dz>3&&dz<8 && y<-R*HEAD_SY*0.8 && Math.abs(x)<R*0.7) browBump=1.5;
        // 頬骨の幅広（顔側面を微小に膨らませる）
        let cheekBump = 0;
        if (dz>-4&&dz<4 && Math.abs(x)>R*0.6 && y<-R*HEAD_SY*0.3) cheekBump=1;

        // 顔面エリア判定: 前面の平坦な領域（顔パーツのオーバーレイ用）
        const faceArea = y<FACE_SURFACE_Y+1 && Math.abs(x)<R*0.75 && dz>-8 && dz<10;

        // 肌色の決定
        let c=1;                                          // デフォルト: 標準肌色
        if (y>R*HEAD_SY*0.2) c=2;                         // 後頭部: 暗い肌色
        if (Math.abs(nx)>0.75) c=2;                       // 側面: 暗い肌色
        if (dz<-4) c=3;                                   // 下顎の影
        if (dz<-R*0.65) c=4;                              // 顎底部: 最も暗い肌色
        if (browBump>0) c=3;                               // 眉骨の影
        if (cheekBump>0) c=25;                             // 頬骨のハイライト
        if (faceArea && y<=FACE_SURFACE_Y+2) c=1;         // 顔面前面: きれいな肌色

        v.push({x,y,z:z+R,colorIndex:c}); // Z座標をオフセットして追加
      }
  // 首部分の生成
  for (let z=-6;z<0;z++)
    for (let x=-7;x<=7;x++)
      for (let y=-6;y<=6;y++)
        // 超楕円で首の断面形状を判定
        if (Math.pow(Math.abs(x/7),2.5)+Math.pow(Math.abs(y/6),2.5)<=1)
          v.push({x,y,z:z+R,colorIndex:3}); // 首は暗い肌色
  // 耳の生成（左右対称、より大きくディテール付き）
  for (let ez=R-3;ez<=R+4;ez++)
    for (const side of [-1,1]) { // 左右
      for (let dy=-1;dy<=1;dy++) {
        v.push({x:side*(R+1),y:dy,z:ez,colorIndex:2}); // 耳の内側層
        v.push({x:side*(R+2),y:dy,z:ez,colorIndex:3}); // 耳の外側層
      }
      v.push({x:side*(R+3),y:0,z:ez,colorIndex:4}); // 耳の先端
    }
  return v; // 頭部ベースボクセル配列を返却
}

// ========================================================================
// headShell for hair（髪用ヘッドシェル判定）
// ========================================================================
// 頭部表面の殻（シェル）内にあるかどうかを判定する関数（髪の配置に使用）
function headShell(x,y,z,inner,outer) {
  const R=HEAD_R, dz=z-R; // 頭部中心からのZ距離
  // 外側楕円体の内外判定
  const d2=(x/(R+outer))**2+(y/(R*HEAD_SY+outer))**2+(dz/(R*HEAD_SZ+outer))**2;
  if (d2>1) return false; // 外側楕円体の外ならfalse
  // 内側楕円体の内外判定
  const d2i=(x/(R+inner))**2+(y/(R*HEAD_SY+inner))**2+(dz/(R*HEAD_SZ+inner))**2;
  return d2i>1; // 内側楕円体の外（=殻の中）ならtrue
}

// ========================================================================
// EYES — 目のバリエーション（6種類）
// ========================================================================
// ノーマル目（標準的なアーモンド型）
function eyesNormal(v) {
  const z=EYE_Z; // 目のZ位置
  for (const sx of [-1,1]) { // 左右対称
    const cx=sx*6; // 目の中心X座標
    // 白目（強膜）: アーモンド型で配置
    for (let ex=-2;ex<=2;ex++) for (let ez=-1;ez<=1;ez++) {
      if (Math.abs(ex)===2&&Math.abs(ez)===1) continue; // 角を削る
      v.push({x:cx+ex,y:FACE_Y,z:z+ez,colorIndex:8});   // 前面レイヤー
      v.push({x:cx+ex,y:FACE_Y-1,z:z+ez,colorIndex:8}); // 奥行レイヤー
    }
    // 虹彩＋瞳孔（暗色）
    v.push({x:cx,y:FACE_Y,z:z,colorIndex:9});            // 瞳孔中心
    v.push({x:cx+sx*-1,y:FACE_Y,z:z,colorIndex:9});      // 瞳孔横
    v.push({x:cx,y:FACE_Y-1,z:z,colorIndex:9});           // 瞳孔奥行
    // 上まぶた（暗い肌色のライン）
    for (let ex=-2;ex<=2;ex++) v.push({x:cx+ex,y:FACE_Y,z:z+2,colorIndex:3});
  }
}
// 細い目（鋭い印象）
function eyesNarrow(v) {
  const z=EYE_Z;
  for (const sx of [-1,1]) {
    const cx=sx*6;
    // 白目: 水平ライン
    for (let ex=-2;ex<=2;ex++) {
      v.push({x:cx+ex,y:FACE_Y,z:z,colorIndex:8});
      v.push({x:cx+ex,y:FACE_Y-1,z:z,colorIndex:8});
    }
    // 瞳孔
    v.push({x:cx,y:FACE_Y,z:z,colorIndex:9});
    v.push({x:cx,y:FACE_Y-1,z:z,colorIndex:9});
    // 上下のまぶたライン
    for (let ex=-2;ex<=2;ex++) {
      v.push({x:cx+ex,y:FACE_Y,z:z+1,colorIndex:3}); // 上まぶた
      v.push({x:cx+ex,y:FACE_Y,z:z-1,colorIndex:2}); // 下まぶた
    }
  }
}
// 大きい目（見開き型）
function eyesWide(v) {
  const z=EYE_Z;
  for (const sx of [-1,1]) {
    const cx=sx*6;
    // 白目: 大きめの矩形（角を削る）
    for (let ex=-2;ex<=2;ex++) for (let ez=-1;ez<=2;ez++) {
      if (Math.abs(ex)===2&&(ez===-1||ez===2)) continue; // 角を削る
      v.push({x:cx+ex,y:FACE_Y,z:z+ez,colorIndex:8});
      v.push({x:cx+ex,y:FACE_Y-1,z:z+ez,colorIndex:8});
    }
    // 大きめの瞳孔（2x2）
    for (let ex=-1;ex<=0;ex++) for (let ez=0;ez<=1;ez++) {
      v.push({x:cx+ex,y:FACE_Y,z:z+ez,colorIndex:9});
      v.push({x:cx+ex,y:FACE_Y-1,z:z+ez,colorIndex:9});
    }
    // 上まぶた
    for (let ex=-1;ex<=1;ex++) v.push({x:cx+ex,y:FACE_Y,z:z+3,colorIndex:3});
  }
}
// アーモンド目（切れ長）
function eyesAlmond(v) {
  const z=EYE_Z;
  for (const sx of [-1,1]) {
    const cx=sx*6;
    // 白目: 横長アーモンド形状
    for (let ex=-3;ex<=2;ex++) {
      const h=Math.abs(ex)>=2?0:1; // 端は高さ0、中央は高さ1
      for (let ez=-h;ez<=0;ez++) {
        v.push({x:cx+ex,y:FACE_Y,z:z+ez,colorIndex:8});
        v.push({x:cx+ex,y:FACE_Y-1,z:z+ez,colorIndex:8});
      }
    }
    // 瞳孔
    v.push({x:cx,y:FACE_Y,z:z,colorIndex:9});
    v.push({x:cx,y:FACE_Y-1,z:z,colorIndex:9});
    // 上まぶた
    for (let ex=-2;ex<=1;ex++) v.push({x:cx+ex,y:FACE_Y,z:z+1,colorIndex:3});
  }
}
// 決意の目（力強い印象）
function eyesDetermined(v) {
  const z=EYE_Z;
  for (const sx of [-1,1]) {
    const cx=sx*6;
    // 白目: 2段の横長矩形
    for (let ex=-2;ex<=2;ex++) for (let ez=0;ez<=1;ez++) {
      v.push({x:cx+ex,y:FACE_Y,z:z+ez,colorIndex:8});
      v.push({x:cx+ex,y:FACE_Y-1,z:z+ez,colorIndex:8});
    }
    // 瞳孔（やや大きめ）
    v.push({x:cx,y:FACE_Y,z:z,colorIndex:9});
    v.push({x:cx+sx*-1,y:FACE_Y,z:z,colorIndex:9});
    v.push({x:cx,y:FACE_Y,z:z+1,colorIndex:9});
    v.push({x:cx,y:FACE_Y-1,z:z,colorIndex:9});
    // 上まぶた（つり上がり: 外側ほど高い位置）
    for (let ex=-2;ex<=2;ex++) {
      const lift=(ex*sx>0)?1:0; // 目尻側を持ち上げる
      v.push({x:cx+ex,y:FACE_Y,z:z+2+lift,colorIndex:3});
    }
  }
}
// フード目（奥目・伏し目）
function eyesHooded(v) {
  const z=EYE_Z;
  for (const sx of [-1,1]) {
    const cx=sx*6;
    // 白目: 狭い水平ライン
    for (let ex=-2;ex<=1;ex++) {
      v.push({x:cx+ex,y:FACE_Y,z:z,colorIndex:8});
      v.push({x:cx+ex,y:FACE_Y-1,z:z,colorIndex:8});
    }
    // 瞳孔
    v.push({x:cx,y:FACE_Y,z:z,colorIndex:9});
    v.push({x:cx,y:FACE_Y-1,z:z,colorIndex:9});
    // フード（覆いかぶさるまぶた、暗い肌色で2層）
    for (let ex=-2;ex<=2;ex++) {
      v.push({x:cx+ex,y:FACE_Y,z:z+1,colorIndex:2});
      v.push({x:cx+ex,y:FACE_Y-1,z:z+1,colorIndex:2});
    }
  }
}
// 目バリエーションの定義配列（名前と生成関数のペア）
const EYES=[
  {name:"normal",fn:eyesNormal},{name:"narrow",fn:eyesNarrow},{name:"wide",fn:eyesWide},
  {name:"almond",fn:eyesAlmond},{name:"determined",fn:eyesDetermined},{name:"hooded",fn:eyesHooded},
];

// ========================================================================
// BROWS — 眉毛のバリエーション（6種類）
// ========================================================================
// 太い眉毛
function browsThick(v) {
  const z=BROW_Z;
  for (const sx of [-1,1]) for (let bx=2;bx<=8;bx++) { // 左右対称
    v.push({x:sx*bx,y:FACE_Y,z,colorIndex:10});     // 前面
    v.push({x:sx*bx,y:FACE_Y-1,z,colorIndex:10});   // 奥行
    v.push({x:sx*bx,y:FACE_Y,z:z+1,colorIndex:10}); // 上段
  }
}
// 細い眉毛
function browsThin(v) {
  const z=BROW_Z;
  for (const sx of [-1,1]) for (let bx=3;bx<=8;bx++)
    v.push({x:sx*bx,y:FACE_Y,z,colorIndex:10}); // 1ピクセル幅のライン
}
// 怒り眉（内側が下がるV字型）
function browsAngry(v) {
  const z=BROW_Z;
  for (const sx of [-1,1]) for (let bx=2;bx<=8;bx++) {
    const dip=bx<5?(5-bx):0; // 内側ほど下がる
    v.push({x:sx*bx,y:FACE_Y,z:z-dip,colorIndex:10});
    v.push({x:sx*bx,y:FACE_Y-1,z:z-dip,colorIndex:10});
  }
}
// アーチ眉（中央が持ち上がる）
function browsArched(v) {
  const z=BROW_Z;
  for (const sx of [-1,1]) for (let bx=3;bx<=8;bx++) {
    const arch=(bx>=5&&bx<=6)?1:0; // 中央部を1ボクセル持ち上げ
    v.push({x:sx*bx,y:FACE_Y,z:z+arch,colorIndex:10});
    v.push({x:sx*bx,y:FACE_Y-1,z:z+arch,colorIndex:10});
  }
}
// フラット眉（水平直線）
function browsFlat(v) {
  const z=BROW_Z;
  for (const sx of [-1,1]) for (let bx=3;bx<=8;bx++) {
    v.push({x:sx*bx,y:FACE_Y,z,colorIndex:10});
    v.push({x:sx*bx,y:FACE_Y-1,z,colorIndex:10});
  }
}
// 上がり眉（全体的に高い位置）
function browsRaised(v) {
  const z=BROW_Z+1; // 通常より1ボクセル高い位置
  for (const sx of [-1,1]) for (let bx=3;bx<=8;bx++) {
    const a=(bx>=4&&bx<=6)?1:0; // 中央部をさらに持ち上げ
    v.push({x:sx*bx,y:FACE_Y,z:z+a,colorIndex:10});
  }
}
// 眉バリエーションの定義配列
const BROWS=[
  {name:"thick",fn:browsThick},{name:"thin",fn:browsThin},{name:"angry",fn:browsAngry},
  {name:"arched",fn:browsArched},{name:"flat",fn:browsFlat},{name:"raised",fn:browsRaised},
];

// ========================================================================
// NOSES — 鼻のバリエーション（5種類）
// ========================================================================
// 平均的な鼻
function noseAverage(v) {
  const z=NOSE_Z;
  v.push({x:0,y:FACE_Y-1,z:z+2,colorIndex:2}); // 鼻梁上部
  v.push({x:0,y:FACE_Y-1,z:z+1,colorIndex:2}); // 鼻梁中部
  v.push({x:0,y:FACE_Y-2,z:z,colorIndex:2});    // 鼻先（突き出し）
  v.push({x:0,y:FACE_Y-2,z:z+1,colorIndex:2});  // 鼻先上
  v.push({x:-1,y:FACE_Y-1,z,colorIndex:3});      // 左小鼻（影色）
  v.push({x:1,y:FACE_Y-1,z,colorIndex:3});       // 右小鼻（影色）
}
// 幅広い鼻
function noseWide(v) {
  const z=NOSE_Z;
  v.push({x:0,y:FACE_Y-1,z:z+2,colorIndex:2}); // 鼻梁
  v.push({x:0,y:FACE_Y-2,z:z+1,colorIndex:2}); // 中間
  v.push({x:0,y:FACE_Y-2,z,colorIndex:2});       // 鼻先
  // 幅広い小鼻（5ボクセル幅）
  for (let x=-2;x<=2;x++) v.push({x,y:FACE_Y-1,z,colorIndex:x===0?2:3});
  v.push({x:-2,y:FACE_Y-1,z:z-1,colorIndex:4}); // 左小鼻の影
  v.push({x:2,y:FACE_Y-1,z:z-1,colorIndex:4});  // 右小鼻の影
}
// 細い鼻（鼻筋が通った印象）
function noseNarrow(v) {
  const z=NOSE_Z;
  // 鼻梁を縦に4ボクセル（ハイライト色）
  for (let dz=0;dz<=3;dz++) v.push({x:0,y:FACE_Y-1,z:z+dz,colorIndex:25});
  v.push({x:0,y:FACE_Y-2,z,colorIndex:2});       // 鼻先
  v.push({x:0,y:FACE_Y-2,z:z+1,colorIndex:2});   // 鼻先上
}
// 広い鼻（幅広でフラット）
function noseBroad(v) {
  const z=NOSE_Z;
  v.push({x:0,y:FACE_Y-1,z:z+1,colorIndex:2});   // 鼻梁
  v.push({x:0,y:FACE_Y-2,z,colorIndex:2});         // 鼻先中央
  v.push({x:-1,y:FACE_Y-2,z,colorIndex:2});        // 鼻先左
  v.push({x:1,y:FACE_Y-2,z,colorIndex:2});         // 鼻先右
  // 小鼻の下ライン（影色）
  for (let x=-2;x<=2;x++) v.push({x,y:FACE_Y-1,z:z-1,colorIndex:3});
}
// ボタン鼻（小さく丸い）
function noseButton(v) {
  const z=NOSE_Z;
  v.push({x:0,y:FACE_Y-2,z,colorIndex:25});       // 鼻先（ハイライト）
  v.push({x:0,y:FACE_Y-2,z:z+1,colorIndex:25});   // 鼻先上（ハイライト）
  v.push({x:-1,y:FACE_Y-1,z,colorIndex:2});        // 左小鼻
  v.push({x:1,y:FACE_Y-1,z,colorIndex:2});         // 右小鼻
}
// 鼻バリエーションの定義配列
const NOSES=[
  {name:"average",fn:noseAverage},{name:"wide",fn:noseWide},{name:"narrow",fn:noseNarrow},
  {name:"broad",fn:noseBroad},{name:"button",fn:noseButton},
];

// ========================================================================
// MOUTHS — 口のバリエーション（6種類）
// ========================================================================
// ニュートラル口（無表情の一文字）
function mouthNeutral(v) {
  const z=MOUTH_Z;
  for (let x=-4;x<=4;x++) v.push({x,y:FACE_Y,z,colorIndex:11}); // 唇色の水平ライン
}
// ニヤリ口（歯を見せる笑み）
function mouthGrin(v) {
  const z=MOUTH_Z;
  for (let x=-4;x<=4;x++) v.push({x,y:FACE_Y,z,colorIndex:11}); // 唇の基本ライン
  v.push({x:-5,y:FACE_Y,z:z+1,colorIndex:11}); // 左口角（上がり）
  v.push({x:5,y:FACE_Y,z:z+1,colorIndex:11});  // 右口角（上がり）
  // 歯（中央部に白）
  for (let x=-2;x<=2;x++) v.push({x,y:FACE_Y,z:z+1,colorIndex:13});
}
// 真剣口（口角が下がる）
function mouthSerious(v) {
  const z=MOUTH_Z;
  for (let x=-3;x<=3;x++) v.push({x,y:FACE_Y,z,colorIndex:12}); // 暗い唇色
  v.push({x:-4,y:FACE_Y,z:z-1,colorIndex:12}); // 左口角（下がり）
  v.push({x:4,y:FACE_Y,z:z-1,colorIndex:12});  // 右口角（下がり）
}
// スマイル口（大きく口角が上がる）
function mouthSmile(v) {
  const z=MOUTH_Z;
  for (let x=-5;x<=5;x++) v.push({x,y:FACE_Y,z,colorIndex:11}); // 幅広の唇ライン
  v.push({x:-6,y:FACE_Y,z:z+1,colorIndex:11}); // 左口角（上がり）
  v.push({x:6,y:FACE_Y,z:z+1,colorIndex:11});  // 右口角（上がり）
  // 歯（中央部に白）
  for (let x=-3;x<=3;x++) v.push({x,y:FACE_Y,z:z+1,colorIndex:13});
}
// オープン口（大きく開いた口）
function mouthOpen(v) {
  const z=MOUTH_Z-1; // 少し低い位置
  // 口内の暗い部分（3段の矩形）
  for (let x=-3;x<=3;x++) for (let ez=0;ez<=2;ez++)
    v.push({x,y:FACE_Y,z:z+ez,colorIndex:9}); // 暗色（口内）
  // 上下の唇ライン
  for (let x=-4;x<=4;x++) {
    v.push({x,y:FACE_Y,z:z+3,colorIndex:11}); // 上唇
    v.push({x,y:FACE_Y,z:z-1,colorIndex:12}); // 下唇
  }
  // 歯（上部中央）
  for (let x=-2;x<=2;x++) v.push({x,y:FACE_Y,z:z+2,colorIndex:13});
}
// スマーク口（片側だけ口角が上がる）
function mouthSmirk(v) {
  const z=MOUTH_Z;
  for (let x=-3;x<=3;x++) v.push({x,y:FACE_Y,z,colorIndex:11}); // 唇ライン
  // 左側のみ口角が上がる（ニヤリ表情）
  v.push({x:-4,y:FACE_Y,z:z+1,colorIndex:11});
  v.push({x:-5,y:FACE_Y,z:z+1,colorIndex:11});
}
// 口バリエーションの定義配列
const MOUTHS=[
  {name:"neutral",fn:mouthNeutral},{name:"grin",fn:mouthGrin},{name:"serious",fn:mouthSerious},
  {name:"smile",fn:mouthSmile},{name:"open",fn:mouthOpen},{name:"smirk",fn:mouthSmirk},
];

// ========================================================================
// HAIRS — 髪型のバリエーション（10種類）
// ========================================================================
// バズカット（坊主に近い短髪）
function hairBuzz(v) {
  const R=HEAD_R;
  for (let x=-R-1;x<=R+1;x++) for (let y=-R;y<=R;y++) for (let z=0;z<=2*R+2;z++) {
    if (z<R+2) continue;                      // 頭頂部以上のみ
    if (!headShell(x,y,z,0,1.0)) continue;     // 厚さ1の殻内のみ
    v.push({x,y,z,colorIndex:5});               // 暗い髪色
  }
}
// ショートヘア（短髪）
function hairShort(v) {
  const R=HEAD_R;
  for (let x=-R-2;x<=R+2;x++) for (let y=-R;y<=R;y++) for (let z=0;z<=2*R+5;z++) {
    if (z<R-2) continue;                       // 耳のあたりから上
    if (!headShell(x,y,z,0,2.5)) continue;     // 厚さ2.5の殻
    if (y<-R*HEAD_SY*0.6&&z<R+4) continue;     // 前面下部（顔エリア）を除外
    // 色のバリエーション（高さと位置で変化）
    const c=(z>R+R*HEAD_SZ*0.5)?7:((x+y+z)%3===0?6:5);
    v.push({x,y,z,colorIndex:c});
  }
}
// フェード（サイド短め、トップ長め）
function hairFade(v) {
  const R=HEAD_R;
  for (let x=-R-2;x<=R+2;x++) for (let y=-R;y<=R;y++) for (let z=0;z<=2*R+4;z++) {
    if (z<R) continue;                          // 中間から上
    if (!headShell(x,y,z,0,2.0)) continue;      // 厚さ2の殻
    if (y<-R*HEAD_SY*0.5&&z<R+3) continue;      // 顔エリア除外
    const sH=z-R, sX=Math.abs(x)/R;             // 高さとX位置の正規化
    if (sX>0.6&&sH<5) continue;                 // サイドの低い部分をカット（フェード効果）
    v.push({x,y,z,colorIndex:sH>8?6:5});         // 上部は明るめの髪色
  }
}
// フラットトップ（平らな頂面）
function hairFlatTop(v) {
  const R=HEAD_R;
  for (let x=-R-1;x<=R+1;x++) for (let y=-R;y<=R;y++) for (let z=0;z<=2*R+8;z++) {
    if (z<R+2) continue;                        // 頭頂から上
    const dz=z-R, nx=x/(R+1), ny=y/(R*HEAD_SY+1); // 正規化座標
    // 頭頂部: 平らなブロック形状
    if (dz>R*HEAD_SZ&&Math.abs(nx)<0.75&&Math.abs(ny)<0.8&&dz<R*HEAD_SZ+7) {
      v.push({x,y,z,colorIndex:5}); continue;
    }
    if (!headShell(x,y,z,0,1.5)) continue;      // 側面はシェル内のみ
    if (y<-R*HEAD_SY*0.6&&z<R+3) continue;       // 顔エリア除外
    v.push({x,y,z,colorIndex:5});
  }
}
// アフロヘア（大きな球形）
function hairAfro(v) {
  const R=HEAD_R, aR=R+8; // アフロの半径は頭部+8ボクセル
  for (let x=-aR;x<=aR;x++) for (let y=-aR;y<=aR;y++) for (let z=0;z<=2*R+16;z++) {
    if (z<R-2) continue;                        // 下限
    const dz=z-R;
    // 大きな楕円体の内外判定（アフロの外形）
    if ((x/aR)**2+(y/(aR*0.9))**2+(dz/(aR*1.1))**2>1) continue;
    // 内側の頭部形状を除外（頭部と髪の間の空間は不要）
    const nx=x/(R-1),ny=y/((R-1)*HEAD_SY),nz=dz/((R-1)*HEAD_SZ);
    if (nx*nx+ny*ny+nz*nz<1) continue;
    // 顔エリア除外
    if (y<-R*HEAD_SY*0.4&&z<R+5&&Math.abs(x)<R*0.9) continue;
    // 色のバリエーション（パターン模様）
    v.push({x,y,z,colorIndex:(x+y+z)%3===0?6:5});
  }
}
// モヒカン（中央のみ高い）
function hairMohawk(v) {
  const R=HEAD_R;
  for (let x=-R-1;x<=R+1;x++) for (let y=-R-1;y<=R+1;y++) for (let z=0;z<=2*R+10;z++) {
    const dz=z-R;
    // 中央のモヒカン部分（|x|<=3の範囲）
    if (Math.abs(x)<=3) {
      const mH=R*HEAD_SZ+9, ny=y/(R*HEAD_SY+1); // モヒカンの高さと前後位置
      if (dz>0&&dz<mH&&ny*ny<1) {
        const maxX=3*(1-dz/mH*0.3); // 上に行くほど細くなる
        if (Math.abs(x)<=maxX) { v.push({x,y,z,colorIndex:dz>mH*0.6?7:6}); continue; } // 先端は明るい色
      }
    }
    // 側面は薄いシェルのみ
    if (z>=R&&z<R+3) {
      if (!headShell(x,y,z,0,0.5)) continue;
      if (y<-R*HEAD_SY*0.5&&z<R+2) continue;
      v.push({x,y,z,colorIndex:5});
    }
  }
}
// コーンロウ（編み込み模様）
function hairCornrow(v) {
  const R=HEAD_R;
  for (let x=-R-2;x<=R+2;x++) for (let y=-R;y<=R;y++) for (let z=0;z<=2*R+3;z++) {
    if (z<R) continue;
    if (!headShell(x,y,z,0,2.0)) continue;
    if (y<-R*HEAD_SY*0.5&&z<R+3) continue;
    const row=Math.abs(x)%3;                    // 3ボクセルごとの行パターン
    if (row===1) continue;                       // 1行おきに空ける（溝を表現）
    v.push({x,y,z,colorIndex:row===0?5:6});      // 交互に色を変える
  }
}
// ドレッドヘア（太い編み込み）
function hairDreads(v) {
  const R=HEAD_R;
  for (let x=-R-2;x<=R+2;x++) for (let y=-R-2;y<=R+2;y++) for (let z=0;z<=2*R+4;z++) {
    if (z<R-4) continue;                         // 下に長く伸びる
    if (!headShell(x,y,z,0,3.0)) continue;        // 厚さ3の殻
    if (y<-R*HEAD_SY*0.5&&z<R+3&&z>R-2) continue; // 顔エリア除外
    // ロープ状パターン（4ボクセル周期）
    const rope=(Math.abs(x)+Math.abs(y))%4;
    if (rope>=2) continue;                        // 半分を空ける
    v.push({x,y,z,colorIndex:rope===0?5:6});      // 交互の色
  }
}
// ヘッドバンド付きショートヘア
function hairHeadband(v) {
  const R=HEAD_R;
  // まずショートヘア部分を生成
  for (let x=-R-1;x<=R+1;x++) for (let y=-R;y<=R;y++) for (let z=0;z<=2*R+3;z++) {
    if (z<R+2) continue;
    if (!headShell(x,y,z,0,1.5)) continue;
    if (y<-R*HEAD_SY*0.5&&z<R+3) continue;
    v.push({x,y,z,colorIndex:5});
  }
  // ヘッドバンド（頭部を一周するリング状）
  const bZ=R+3; // バンドのZ位置
  for (let x=-R-2;x<=R+2;x++) for (let y=-R;y<=R;y++) {
    // リング形状: 外側楕円内かつ内側楕円外
    const d2=(x/(R+2))**2+(y/(R*HEAD_SY+2))**2;
    if (d2>1||d2<0.85) continue;
    for (let bz=bZ;bz<=bZ+1;bz++) v.push({x,y,z:bz,colorIndex:24}); // ヘッドバンド色（赤）
  }
}
// ボウズ（完全なハゲ＋ハイライト）
function hairBald(v) {
  const R=HEAD_R;
  for (let x=-R;x<=R;x++) for (let y=-R;y<=R;y++) {
    const z=R+Math.floor(R*HEAD_SZ); // 頭頂の位置
    if (!headShell(x,y,z,-1,0.5)) continue;
    v.push({x,y,z,colorIndex:25}); // 肌ハイライト色（光沢感）
  }
}
// 髪型バリエーションの定義配列
const HAIRS=[
  {name:"buzz",fn:hairBuzz},{name:"short",fn:hairShort},{name:"fade",fn:hairFade},
  {name:"flat_top",fn:hairFlatTop},{name:"afro",fn:hairAfro},{name:"mohawk",fn:hairMohawk},
  {name:"cornrow",fn:hairCornrow},{name:"dreads",fn:hairDreads},{name:"headband",fn:hairHeadband},
  {name:"bald",fn:hairBald},
];

// ========================================================================
// Cheeks + Jaw overlay — 頬と顎のオーバーレイ
// ========================================================================
// 頬のハイライトと顎のラインを追加する関数
function cheeksAndJaw(v) {
  const R=HEAD_R;
  // 頬のハイライト（左右対称）
  for (const sx of [-1,1])
    for (let x=7;x<=10;x++) for (let z=R-2;z<=R+1;z++)
      v.push({x:sx*x,y:FACE_Y+1,z,colorIndex:25}); // 肌ハイライト色
  // 顎ライン（暗い肌色の水平ライン）
  for (let x=-8;x<=8;x++)
    v.push({x,y:FACE_Y+1,z:R-7,colorIndex:4}); // 最も暗い肌色
}

// ========================================================================
// MAIN — メイン実行関数
// ========================================================================
// ディレクトリが存在しなければ再帰的に作成するヘルパー
function ensureDir(d){if(!fs.existsSync(d))fs.mkdirSync(d,{recursive:true});}

// メイン処理
function main() {
  const pal = makePalette(); // カラーパレットを作成
  ensureDir(OUT);             // 出力ディレクトリを確保

  // === 体パーツの生成 ===
  console.log("\n=== HQ Body Parts ===\n");
  // 各体パーツを順次生成してVOXファイルに書き出し
  for (const [name,gen] of [
    ["torso",generateTorso],["hip",generateHip],["upper_arm",generateUpperArm],
    ["forearm",generateForearm],["hand",generateHand],["thigh",generateThigh],
    ["shin",generateShin],["shoe",generateShoe],
  ]) {
    const {voxels,sx,sy,sz}=gen(); // ボクセル生成（正規化済み）
    writeVox(path.join(OUT,`${name}.vox`),sx,sy,sz,voxels,pal); // VOXファイル書き出し
  }

  // === 頭部の生成 ===
  console.log("\n=== HQ Head ===\n");
  // ヘッドベースをグリッド正規化して書き出し
  const hb=normalizeToHeadGrid(dedup(headBase()));
  writeVox(path.join(OUT,"head_base.vox"),hb.sx,hb.sy,hb.sz,hb.voxels,pal);
  // ゲーム用の組み合わせ済みヘッド（ベース＋ショートヘア＋ノーマル目＋太眉＋平均鼻＋ニュートラル口＋頬・顎）
  const combined=dedup([...headBase(),...(()=>{const v=[];hairShort(v);eyesNormal(v);browsThick(v);noseAverage(v);mouthNeutral(v);cheeksAndJaw(v);return v;})()]);
  const ch=normalize(combined); // 正規化
  writeVox(path.join(OUT,"head.vox"),ch.sx,ch.sy,ch.sz,ch.voxels,pal); // 書き出し

  // === 顔パーツバリエーションの生成 ===
  // カテゴリ定義: ラベル・出力ディレクトリ・ファイル名プレフィックス・バリエーション配列
  const cats=[
    {l:"Eyes",d:"eyes",p:"eyes",items:EYES},     // 目（6種類）
    {l:"Brows",d:"brows",p:"brows",items:BROWS}, // 眉（6種類）
    {l:"Noses",d:"noses",p:"nose",items:NOSES},   // 鼻（5種類）
    {l:"Mouths",d:"mouths",p:"mouth",items:MOUTHS}, // 口（6種類）
    {l:"Hairs",d:"hairs",p:"hair",items:HAIRS},   // 髪（10種類）
  ];
  // 各カテゴリの全バリエーションを生成
  for (const cat of cats) {
    console.log(`\n=== HQ ${cat.l} ===\n`);
    ensureDir(path.join(OUT,cat.d)); // サブディレクトリ作成
    for (const item of cat.items) {
      const v=[]; item.fn(v);        // バリエーション生成関数を実行
      const r=normalizeToHeadGrid(dedup(v)); // グリッド正規化
      writeVox(path.join(OUT,cat.d,`${cat.p}_${item.name}.vox`),r.sx,r.sy,r.sz,r.voxels,pal); // 書き出し
    }
  }

  // === サマリー出力 ===
  const counts=cats.map(c=>c.items.length); // 各カテゴリの種類数
  console.log("\n=== Summary ===");
  // 各カテゴリの種類数と名前を表示
  for (const c of cats) console.log(`  ${c.l}: ${c.items.length} (${c.items.map(i=>i.name).join(", ")})`);
  // 組み合わせ総数を計算して表示（全カテゴリの種類数の積）
  console.log(`  Total: ${counts.reduce((a,b)=>a*b,1).toLocaleString()} combinations`);
}

// メイン関数を実行
main();
