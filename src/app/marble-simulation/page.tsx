"use client";

import dynamic from "next/dynamic";

// Babylon.jsはSSR非対応のためdynamic importでクライアント専用にする
const MarbleScene = dynamic(
  () => import("@/SimulationPlay/MarbleSimulation/Components/MarbleScene"),
  { ssr: false }
);

export default function MarbleSimulationPage() {
  return <MarbleScene />;
}
