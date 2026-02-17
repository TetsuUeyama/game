import { FaceConfig, DEFAULT_FACE_CONFIG, HairStyle, BeardStyle, EyeStyle, MouthStyle } from "@/GamePlay/GameSystem/CharacterModel/Types/FaceConfig";

/**
 * FaceConfig から Canvas 2D API で128x128のカートゥーン顔を描画し、data URL を返す
 */
export class FaceAvatarRenderer {
  private static readonly SIZE = 128;

  /**
   * FaceConfig から顔アバター画像を生成
   * @param faceConfig 顔設定（省略時はデフォルト）
   * @returns PNG の data URL
   */
  static render(faceConfig?: FaceConfig): string {
    const fc = faceConfig ?? DEFAULT_FACE_CONFIG;
    const size = FaceAvatarRenderer.SIZE;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const centerX = size / 2;
    const centerY = size / 2;
    const headRadius = size * 0.38; // 頭直径0.25 → canvas半径

    // 1. 頭（円）— skinColor
    ctx.fillStyle = FaceAvatarRenderer.toCSS(fc.skinColor);
    ctx.beginPath();
    ctx.arc(centerX, centerY, headRadius, 0, Math.PI * 2);
    ctx.fill();

    // 頭の輪郭線
    ctx.strokeStyle = FaceAvatarRenderer.darken(fc.skinColor, 0.3);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, headRadius, 0, Math.PI * 2);
    ctx.stroke();

    // 2. 髪 — hairStyle + hairColor
    FaceAvatarRenderer.drawHair(ctx, fc, centerX, centerY, headRadius);

    // 3. 目x2 — eyeColor, eyeSize, eyePositionY
    FaceAvatarRenderer.drawEyes(ctx, fc, centerX, centerY, headRadius);

    // 4. 口 — mouthColor, mouthWidth, mouthPositionY
    FaceAvatarRenderer.drawMouth(ctx, fc, centerX, centerY, headRadius);

    // 5. 髭 — beardStyle + beardColor
    FaceAvatarRenderer.drawBeard(ctx, fc, centerX, centerY, headRadius);

    return canvas.toDataURL('image/png');
  }

  private static drawEyes(
    ctx: CanvasRenderingContext2D,
    fc: FaceConfig,
    cx: number, cy: number,
    headRadius: number
  ): void {
    const eyeOffsetX = headRadius * 0.33;
    const eyeOffsetY = -(fc.eyePositionY / 0.125) * headRadius * 0.25;
    const eyeRadius = headRadius * 0.1 * fc.eyeSize;
    const style = fc.eyeStyle;

    for (const side of [-1, 1] as const) {
      const ex = cx + eyeOffsetX * side;
      const ey = cy + eyeOffsetY;

      ctx.save();
      ctx.translate(ex, ey);

      // スタイル別の傾き
      if (style === EyeStyle.SHARP) {
        ctx.rotate(side === -1 ? -0.25 : 0.25); // つり目
      } else if (style === EyeStyle.DROOPY) {
        ctx.rotate(side === -1 ? 0.25 : -0.25); // たれ目
      }

      // スタイル別のスケール
      let scaleX = 1.0;
      let scaleY = 1.0;
      let whiteScale = 1.5;

      switch (style) {
        case EyeStyle.NARROW:
          scaleX = 1.6; scaleY = 0.5; whiteScale = 1.3;
          break;
        case EyeStyle.WIDE:
          scaleX = 1.2; scaleY = 1.2; whiteScale = 1.6;
          break;
        case EyeStyle.SHARP:
          scaleX = 1.4; scaleY = 0.6; whiteScale = 1.3;
          break;
        case EyeStyle.DROOPY:
          scaleX = 1.3; scaleY = 0.7; whiteScale = 1.4;
          break;
      }

      // 白目
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.ellipse(0, 0, eyeRadius * whiteScale * scaleX, eyeRadius * whiteScale * scaleY, 0, 0, Math.PI * 2);
      ctx.fill();
      // 白目の輪郭
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // 瞳
      ctx.fillStyle = FaceAvatarRenderer.toCSS(fc.eyeColor);
      ctx.beginPath();
      ctx.ellipse(0, 0, eyeRadius * scaleX, eyeRadius * scaleY, 0, 0, Math.PI * 2);
      ctx.fill();

      // ハイライト
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.arc(-eyeRadius * 0.25, -eyeRadius * 0.25, eyeRadius * 0.35, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  private static drawMouth(
    ctx: CanvasRenderingContext2D,
    fc: FaceConfig,
    cx: number, cy: number,
    headRadius: number
  ): void {
    const mouthOffsetY = -(fc.mouthPositionY / 0.125) * headRadius * 0.25;
    const mouthHalfWidth = (fc.mouthWidth / 0.06) * headRadius * 0.2;
    const my = cy + mouthOffsetY;
    const style = fc.mouthStyle;

    ctx.fillStyle = FaceAvatarRenderer.toCSS(fc.mouthColor);
    ctx.strokeStyle = FaceAvatarRenderer.darken(fc.mouthColor, 0.3);
    ctx.lineWidth = 1.5;

    switch (style) {
      case MouthStyle.WIDE: {
        // 横に広い薄い口
        const w = mouthHalfWidth * 1.5;
        const h = headRadius * 0.04;
        ctx.beginPath();
        ctx.ellipse(cx, my, w, h, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        break;
      }
      case MouthStyle.SMALL: {
        // 小さい丸口
        const r = mouthHalfWidth * 0.4;
        ctx.beginPath();
        ctx.arc(cx, my, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        break;
      }
      case MouthStyle.SMILE: {
        // 笑顔カーブ
        ctx.beginPath();
        ctx.moveTo(cx - mouthHalfWidth, my - headRadius * 0.02);
        ctx.quadraticCurveTo(cx, my + headRadius * 0.1, cx + mouthHalfWidth, my - headRadius * 0.02);
        ctx.quadraticCurveTo(cx, my + headRadius * 0.05, cx - mouthHalfWidth, my - headRadius * 0.02);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      }
      case MouthStyle.SERIOUS: {
        // 真一文字
        const w = mouthHalfWidth * 1.2;
        ctx.beginPath();
        ctx.moveTo(cx - w, my);
        ctx.lineTo(cx + w, my);
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = FaceAvatarRenderer.toCSS(fc.mouthColor);
        ctx.stroke();
        break;
      }
      default: {
        // NORMAL
        const h = headRadius * 0.06;
        ctx.beginPath();
        ctx.ellipse(cx, my, mouthHalfWidth, h, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        break;
      }
    }
  }

  private static drawHair(
    ctx: CanvasRenderingContext2D,
    fc: FaceConfig,
    cx: number, cy: number,
    headRadius: number
  ): void {
    if (fc.hairStyle === HairStyle.NONE) return;

    ctx.fillStyle = FaceAvatarRenderer.toCSS(fc.hairColor);

    switch (fc.hairStyle) {
      case HairStyle.SHORT: {
        // 頭頂部の弧
        ctx.beginPath();
        ctx.arc(cx, cy, headRadius * 1.02, Math.PI, Math.PI * 2);
        ctx.lineTo(cx + headRadius * 0.9, cy - headRadius * 0.3);
        ctx.lineTo(cx - headRadius * 0.9, cy - headRadius * 0.3);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case HairStyle.MEDIUM: {
        // 頭頂部 + サイドに伸びる
        ctx.beginPath();
        ctx.arc(cx, cy, headRadius * 1.05, Math.PI * 0.85, Math.PI * 2.15);
        ctx.lineTo(cx + headRadius * 0.95, cy - headRadius * 0.1);
        ctx.lineTo(cx - headRadius * 0.95, cy - headRadius * 0.1);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case HairStyle.LONG: {
        // 頭全体 + 下まで垂れる
        ctx.beginPath();
        ctx.arc(cx, cy, headRadius * 1.08, Math.PI * 0.7, Math.PI * 2.3);
        ctx.lineTo(cx + headRadius * 0.8, cy + headRadius * 0.8);
        ctx.quadraticCurveTo(cx, cy + headRadius * 1.0, cx - headRadius * 0.8, cy + headRadius * 0.8);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case HairStyle.MOHAWK: {
        // 中央の立った髪
        const mohawkWidth = headRadius * 0.2;
        const mohawkHeight = headRadius * 0.5;
        ctx.beginPath();
        ctx.moveTo(cx - mohawkWidth, cy - headRadius * 0.6);
        ctx.lineTo(cx - mohawkWidth * 0.5, cy - headRadius - mohawkHeight);
        ctx.lineTo(cx + mohawkWidth * 0.5, cy - headRadius - mohawkHeight);
        ctx.lineTo(cx + mohawkWidth, cy - headRadius * 0.6);
        ctx.closePath();
        ctx.fill();
        // 根元部分
        ctx.beginPath();
        ctx.arc(cx, cy, headRadius * 1.02, Math.PI * 1.2, Math.PI * 1.8);
        ctx.lineTo(cx + mohawkWidth, cy - headRadius * 0.6);
        ctx.lineTo(cx - mohawkWidth, cy - headRadius * 0.6);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case HairStyle.BUZZ: {
        // 頭にぴったりの薄い層
        ctx.beginPath();
        ctx.arc(cx, cy, headRadius * 1.01, Math.PI * 0.9, Math.PI * 2.1);
        ctx.lineTo(cx + headRadius * 0.85, cy - headRadius * 0.35);
        ctx.lineTo(cx - headRadius * 0.85, cy - headRadius * 0.35);
        ctx.closePath();
        ctx.fill();
        break;
      }
    }
  }

  private static drawBeard(
    ctx: CanvasRenderingContext2D,
    fc: FaceConfig,
    cx: number, cy: number,
    headRadius: number
  ): void {
    if (fc.beardStyle === BeardStyle.NONE) return;

    ctx.fillStyle = FaceAvatarRenderer.toCSS(fc.beardColor);

    switch (fc.beardStyle) {
      case BeardStyle.STUBBLE: {
        // 顎の下の薄い半透明レイヤー
        const prevAlpha = ctx.globalAlpha;
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.arc(cx, cy, headRadius * 0.95, Math.PI * 0.15, Math.PI * 0.85);
        ctx.lineTo(cx - headRadius * 0.5, cy + headRadius * 0.6);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = prevAlpha;
        break;
      }
      case BeardStyle.FULL: {
        // 顎全体を覆う
        ctx.beginPath();
        ctx.arc(cx, cy, headRadius * 0.98, Math.PI * 0.1, Math.PI * 0.9);
        ctx.quadraticCurveTo(cx, cy + headRadius * 1.2, cx - headRadius * 0.7, cy + headRadius * 0.3);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case BeardStyle.GOATEE: {
        // 口の下の小さな領域
        ctx.beginPath();
        ctx.ellipse(cx, cy + headRadius * 0.55, headRadius * 0.15, headRadius * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
    }
  }

  /**
   * ColorRGB を CSS色文字列に変換
   */
  private static toCSS(c: { r: number; g: number; b: number }): string {
    const r = Math.round(Math.min(1, Math.max(0, c.r)) * 255);
    const g = Math.round(Math.min(1, Math.max(0, c.g)) * 255);
    const b = Math.round(Math.min(1, Math.max(0, c.b)) * 255);
    return `rgb(${r},${g},${b})`;
  }

  /**
   * 色を暗くする
   */
  private static darken(c: { r: number; g: number; b: number }, amount: number): string {
    return FaceAvatarRenderer.toCSS({
      r: c.r * (1 - amount),
      g: c.g * (1 - amount),
      b: c.b * (1 - amount),
    });
  }
}
