"use client";

import dynamic from "next/dynamic";

const FallingPointPredictionView = dynamic(
  () => import("@/falling-point-prediction/FallingPointPredictionView"),
  { ssr: false }
);

export default function FallingPointPredictionPage() {
  return <FallingPointPredictionView />;
}
