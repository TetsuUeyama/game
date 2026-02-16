"use client";

import { useEffect, useRef } from "react";
import { FaceParams } from "@/GamePlay/GameSystem/CharacterModel/UI/CheckModeTypes";

interface FacePreviewCanvasProps {
  params: FaceParams;
}

/** 顔の Y 座標範囲 */
const FACE_Y_MIN = 1.50;
const FACE_Y_MAX = 1.70;
/** 顔の X 座標範囲（左右） */
const FACE_X_RANGE = 0.08;

/**
 * 顔パーツの 2D プレビューキャンバス
 *
 * FaceParams をリアルタイムに正面から描画する。
 * WebGL を使わず 2D Canvas API のみで動作する。
 */
export function FacePreviewCanvas({ params }: FacePreviewCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // canvas バッファサイズを CSS サイズに合わせる
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const w = rect.width;
    const h = rect.height;

    // 座標変換: ワールド座標 → canvas ピクセル
    const toX = (wx: number) => w / 2 + (wx / FACE_X_RANGE) * (w / 2);
    const toY = (wy: number) => h - ((wy - FACE_Y_MIN) / (FACE_Y_MAX - FACE_Y_MIN)) * h;
    const toW = (ws: number) => (ws / FACE_X_RANGE) * (w / 2);
    const toH = (ws: number) => (ws / (FACE_Y_MAX - FACE_Y_MIN)) * h;

    // 背景
    ctx.fillStyle = "#222";
    ctx.fillRect(0, 0, w, h);

    // 頭（肌色の楕円）
    ctx.fillStyle = "#d9b899";
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.48, w * 0.38, h * 0.46, 0, 0, Math.PI * 2);
    ctx.fill();

    const { eye, eyebrow, nose, mouth } = params;

    // ── 眉毛 ──
    ctx.fillStyle = "#2a1a0e";
    for (const side of [-1, 1] as const) {
      const bx = toX(side * eyebrow.spacing);
      const by = toY(eyebrow.y);
      const bw = toW(eyebrow.width);
      const bh = toH(eyebrow.height);
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(-side * eyebrow.angle);
      ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
      ctx.restore();
    }

    // ── 目（白目 + 黒目） ──
    for (const side of [-1, 1] as const) {
      const ex = toX(side * eye.spacing);
      const ey = toY(eye.y);
      const rx = toW(eye.diameter / 2) * eye.scaleX;
      const ry = toH(eye.diameter / 2) * eye.scaleY;

      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(-side * eye.angle);

      // 白目
      ctx.fillStyle = "#f2f2f2";
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();

      // 黒目
      const pr = eye.pupilRatio;
      const pxR = rx * pr;
      const pyR = ry * pr;
      const pOffY = -toH(eye.pupilOffsetY);
      ctx.fillStyle = "#0d0d0d";
      ctx.beginPath();
      ctx.ellipse(0, pOffY, pxR, pyR, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    // ── 鼻 ──
    const nx = toX(0);
    const ny = toY(nose.y);
    const nw = toW(nose.width);
    const nh = toH(nose.height);
    ctx.fillStyle = "#c9a07a";

    if (nose.shape === "wedge" || nose.shape === "halfCone") {
      // 三角形
      const topW = nose.shape === "halfCone" ? nw * (nose.topRatio ?? 0) : 0;
      ctx.beginPath();
      ctx.moveTo(nx - topW / 2, ny - nh / 2);
      ctx.lineTo(nx + topW / 2, ny - nh / 2);
      ctx.lineTo(nx + nw / 2, ny + nh / 2);
      ctx.lineTo(nx - nw / 2, ny + nh / 2);
      ctx.closePath();
      ctx.fill();
    } else {
      // box
      ctx.fillRect(nx - nw / 2, ny - nh / 2, nw, nh);
    }

    // ── 口 ──
    ctx.fillStyle = "#994d4d";
    const my = toY(mouth.y);
    const mhw = toW(mouth.halfWidth);
    const mh = toH(mouth.height);

    for (const side of [-1, 1] as const) {
      const mx = toX(0) + side * mhw / 2;
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(-side * mouth.angle);
      ctx.fillRect(-mhw / 2, -mh / 2, mhw, mh);
      ctx.restore();
    }

  }, [params]);

  return (
    <canvas
      ref={canvasRef}
      style={canvasStyle}
    />
  );
}

const canvasStyle: React.CSSProperties = {
  width: "100%",
  height: 220,
  display: "block",
  borderRadius: 4,
  background: "#222",
};
