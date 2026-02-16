"use client";

import dynamic from "next/dynamic";

const FallingPointPredictionView = dynamic(
  () => import("@/GamePlay/GameSystem/FallingPointPrediction/FallingPointPredictionView"),
  { ssr: false }
);

export default function FallingPointPredictionPage() {
  return <FallingPointPredictionView />;
}
