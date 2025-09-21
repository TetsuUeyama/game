import { DropZoneConfig } from '@/types/poker/DropZoneTypes'

export const dropZoneConfig: DropZoneConfig = {
  slots: [
    {
      id: 0,
      name: "メインアタック",
      description: "主要な攻撃スロット。最も強力な攻撃を配置してください。",
      effect: "ダメージ +20%",
      cooldown: "標準",
      target: "前方",
      icon: {
        imagePath: "/images/icon/heavystrike.png",
        fallbackEmoji: "⚔",
        bgColor: "red.400",
        borderRadius: "full"
      },
      dialogContent: {
        title: "メインアタック",
        details: [
          { label: "ダメージ", value: "ダメージ +20%", color: "yellow.300" },
          { label: "クールダウン", value: "前方", color: "blue.300" },
          { label: "CD", value: "標準", color: "red.300" },
          { label: "特徴", value: "主力攻撃用", color: "green.300" }
        ]
      }
    },
    {
      id: 1,
      name: "サブアタック",
      description: "補助的な攻撃スロット。連続攻撃に適しています。",
      effect: "攻撃速度 +15%",
      cooldown: "短縮",
      target: "選択",
      icon: {
        imagePath: "/images/icon/furryofstrike.png",
        fallbackEmoji: "⚡",
        bgColor: "yellow.400",
        borderRadius: "full"
      },
      dialogContent: {
        title: "サブアタック",
        details: [
          { label: "効果", value: "攻撃速度 +15%", color: "yellow.300" },
          { label: "対象", value: "選択", color: "blue.300" },
          { label: "CD", value: "短縮", color: "red.300" },
          { label: "特徴", value: "連続攻撃向け", color: "green.300" }
        ]
      }
    },
    {
      id: 2,
      name: "ディフェンス",
      description: "防御専用スロット。シールド効果を発動します。",
      effect: "被ダメージ -30%",
      cooldown: "長い",
      target: "自分",
      icon: {
        imagePath: "/images/icon/guard.png",
        fallbackEmoji: "🛡",
        bgColor: "blue.400",
        borderRadius: "md"
      },
      dialogContent: {
        title: "ディフェンス",
        details: [
          { label: "ダメージ", value: "被ダメージ -30%", color: "yellow.300" },
          { label: "クールダウン", value: "自分", color: "blue.300" },
          { label: "CD", value: "長い", color: "red.300" },
          { label: "特徴", value: "防御特化", color: "green.300" }
        ]
      }
    },
    {
      id: 3,
      name: "バッファー",
      description: "支援効果スロット。味方の能力を向上させます。",
      effect: "全体強化",
      cooldown: "中程度",
      target: "全体",
      icon: {
        imagePath: "/images/icon/anticipate.png",
        fallbackEmoji: "✨",
        bgColor: "purple.400",
        borderRadius: "md"
      },
      dialogContent: {
        title: "バッファー",
        details: [
          { label: "効果", value: "全体強化", color: "yellow.300" },
          { label: "対象", value: "全体", color: "blue.300" },
          { label: "CD", value: "中程度", color: "red.300" },
          { label: "特徴", value: "支援効果", color: "green.300" }
        ]
      }
    },
    {
      id: 4,
      name: "トリック",
      description: "特殊効果スロット。相手の行動を妨害します。",
      effect: "妨害効果",
      cooldown: "ランダム",
      target: "相手",
      icon: {
        imagePath: "/images/icon/obstruction.png",
        fallbackEmoji: "🎭",
        bgColor: "pink.400",
        borderRadius: "md"
      },
      dialogContent: {
        title: "トリック",
        details: [
          { label: "効果", value: "妨害効果", color: "yellow.300" },
          { label: "対象", value: "相手", color: "blue.300" },
          { label: "CD", value: "ランダム", color: "red.300" },
          { label: "特徴", value: "デバフ系", color: "green.300" }
        ]
      }
    },
    {
      id: 5,
      name: "フィニッシュ",
      description: "決め技スロット。大ダメージを与える必殺技です。",
      effect: "クリティカル率 +50%",
      cooldown: "非常に長い",
      target: "単体",
      icon: {
        imagePath: "/images/icon/footwork.png",
        fallbackEmoji: "💥",
        bgColor: "orange.400",
        borderRadius: "full"
      },
      dialogContent: {
        title: "フィニッシュ",
        details: [
          { label: "効果", value: "クリティカル率 +50%", color: "yellow.300" },
          { label: "対象", value: "単体", color: "blue.300" },
          { label: "CD", value: "非常に長い", color: "red.300" },
          { label: "特徴", value: "必殺技", color: "green.300" }
        ]
      }
    }
  ],
  defaultSlot: {
    name: "カード捨て場",
    description: "カードをここにドロップして捨て札にしてください",
    effect: "なし",
    cooldown: "なし",
    target: "なし",
    icon: {
      imagePath: "",
      fallbackEmoji: "🗑",
      bgColor: "gray.400",
      borderRadius: "md"
    },
    dialogContent: {
      title: "カード捨て場",
      details: [
        { label: "機能", value: "カード破棄", color: "gray.300" },
        { label: "対象", value: "選択カード", color: "blue.300" },
        { label: "効果", value: "手札整理", color: "green.300" }
      ]
    }
  }
}