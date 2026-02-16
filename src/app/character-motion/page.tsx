"use client";

import dynamic from "next/dynamic";

// Babylon.jsはSSR非対応のためdynamic importでクライアント専用にする
const HumanoidScene = dynamic(
  () => import("@/GamePlay/MatchEngine/TestScene/HumanoidScene"),
  { ssr: false }
);

export default function CharacterMotionPage() {
  return <HumanoidScene />;
}
