"use client";

import dynamic from "next/dynamic";

const FallingPointPredictionView = dynamic(
  () => import("@/GamePlay/GameSystem/JumpBallSystem/FallingPointPredictionView"),
  { ssr: false }
);

export default function FallingPointPredictionPage() {
  return <FallingPointPredictionView />;
}
