/**
 * character-moveゲームのエントリーポイント
 */
import { GameScene } from "@/GamePlay/GameSystem/CharacterMove/Scenes/GameScene";

// グローバルスコープの型定義
declare global {
  interface Window {
    gameScene?: GameScene;
  }
}

// DOMContentLoadedイベントを待つ
window.addEventListener("DOMContentLoaded", () => {
  // キャンバス要素を取得
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;

  if (!canvas) {
    console.error("[Main] Canvas element not found!");
    return;
  }

  try {
    // ゲームシーンを作成
    const gameScene = new GameScene(canvas);

    // グローバルスコープにゲームシーンを保存（デバッグ用）
    window.gameScene = gameScene;
  } catch (error) {
    console.error("[Main] ゲームシーンの作成に失敗しました:", error);

    // エラーメッセージを表示
    const errorMessage = document.createElement("div");
    errorMessage.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(220, 38, 38, 0.9);
      color: white;
      padding: 24px;
      border-radius: 8px;
      font-size: 16px;
      text-align: center;
      z-index: 1000;
    `;
    errorMessage.innerHTML = `
      <h2 style="margin-bottom: 16px;">エラーが発生しました</h2>
      <p>${error instanceof Error ? error.message : String(error)}</p>
    `;
    document.body.appendChild(errorMessage);
  }
});
