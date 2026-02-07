import { Scene, FreeCamera, Vector3, RenderTargetTexture, Color4, PointLight } from "@babylonjs/core";
import { Character } from "../entities/Character";

export interface FaceAvatarData {
  characterId: string;
  team: 'ally' | 'enemy';
  playerName: string;
  position: string;
  dataUrl: string;
}

/**
 * 各キャラクターの頭部を RenderTargetTexture でキャプチャし、data URL を返すユーティリティ
 */
export class FaceAvatarCapture {
  /**
   * 全キャラクターの顔をキャプチャ
   */
  static async captureAll(
    scene: Scene,
    allyCharacters: Character[],
    enemyCharacters: Character[]
  ): Promise<FaceAvatarData[]> {
    const results: FaceAvatarData[] = [];

    for (const character of allyCharacters) {
      const dataUrl = await FaceAvatarCapture.captureCharacterFace(scene, character);
      results.push({
        characterId: character.playerData?.basic.ID ?? '',
        team: 'ally',
        playerName: character.playerData?.basic.NAME ?? '',
        position: character.playerPosition ?? '',
        dataUrl,
      });
    }

    for (const character of enemyCharacters) {
      const dataUrl = await FaceAvatarCapture.captureCharacterFace(scene, character);
      results.push({
        characterId: character.playerData?.basic.ID ?? '',
        team: 'enemy',
        playerName: character.playerData?.basic.NAME ?? '',
        position: character.playerPosition ?? '',
        dataUrl,
      });
    }

    return results;
  }

  /**
   * 単一キャラクターの顔をキャプチャして data URL を返す
   */
  private static async captureCharacterFace(scene: Scene, character: Character): Promise<string> {
    const faceMeshes = character.getFaceMeshes();
    if (faceMeshes.length === 0) return '';

    const headMesh = faceMeshes[0];

    // stateIndicator / visionCone を一時非表示
    const stateIndicator = character.getStateIndicator();
    const visionCone = character.getVisionCone();
    const prevStateVisible = stateIndicator.isVisible;
    const prevVisionVisible = visionCone.isVisible;
    stateIndicator.isVisible = false;
    visionCone.isVisible = false;

    // ワールド行列を強制再計算（親→子の順で正確な座標を得る）
    character.mesh.computeWorldMatrix(true);
    for (const mesh of faceMeshes) {
      mesh.computeWorldMatrix(true);
    }

    // headMesh のワールド位置を取得
    const headWorldPos = headMesh.getAbsolutePosition().clone();

    // キャラクターの向きから正面方向を計算
    const rotY = character.mesh.rotation.y;
    const forwardDir = new Vector3(Math.sin(rotY), 0, Math.cos(rotY));

    // カメラを頭の正面 0.5m に配置
    const cameraDist = 0.5;
    const cameraPos = headWorldPos.add(forwardDir.scale(cameraDist));
    const captureCamera = new FreeCamera("faceCaptureCam", cameraPos, scene);
    captureCamera.setTarget(headWorldPos);
    captureCamera.fov = 0.8;
    captureCamera.minZ = 0.01; // 近クリッピング面を十分小さく
    captureCamera.maxZ = 10;

    // キャプチャ専用フィルライト（カメラ位置から正面照射）
    // 既存ライトはそのまま維持し、暗くなる面を補うだけ
    const capturePoint = new PointLight("faceCapPoint", cameraPos, scene);
    capturePoint.intensity = 1.5;
    capturePoint.includedOnlyMeshes = faceMeshes;

    // RTT (128x128) を作成
    const rttSize = 128;
    const rtt = new RenderTargetTexture("faceRTT", rttSize, scene, false);
    rtt.activeCamera = captureCamera;
    rtt.clearColor = new Color4(0, 0, 0, 0);

    // renderList にフェイスメッシュのみ設定
    for (const mesh of faceMeshes) {
      rtt.renderList!.push(mesh);
    }

    // シーンの customRenderTargets に追加してレンダリング
    scene.customRenderTargets.push(rtt);

    // 1フレーム待ってレンダリングを確実に実行
    await new Promise<void>((resolve) => {
      scene.onAfterRenderObservable.addOnce(() => resolve());
    });

    // ピクセルを読み取り
    const pixels = await rtt.readPixels();

    // customRenderTargets から除去
    const idx = scene.customRenderTargets.indexOf(rtt);
    if (idx >= 0) scene.customRenderTargets.splice(idx, 1);

    if (!pixels) {
      rtt.dispose();
      captureCamera.dispose();
      capturePoint.dispose();
      stateIndicator.isVisible = prevStateVisible;
      visionCone.isVisible = prevVisionVisible;
      return '';
    }

    // Canvas に描画（Y軸反転）
    const canvas = document.createElement('canvas');
    canvas.width = rttSize;
    canvas.height = rttSize;
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.createImageData(rttSize, rttSize);

    const pixelData = pixels instanceof Uint8Array ? pixels : new Uint8Array(pixels.buffer);

    // Y軸反転しながらコピー
    for (let y = 0; y < rttSize; y++) {
      const srcRow = (rttSize - 1 - y) * rttSize * 4;
      const dstRow = y * rttSize * 4;
      for (let x = 0; x < rttSize * 4; x++) {
        imageData.data[dstRow + x] = pixelData[srcRow + x];
      }
    }

    ctx.putImageData(imageData, 0, 0);
    const dataUrl = canvas.toDataURL('image/png');

    // クリーンアップ
    rtt.dispose();
    captureCamera.dispose();
    capturePoint.dispose();
    stateIndicator.isVisible = prevStateVisible;
    visionCone.isVisible = prevVisionVisible;

    return dataUrl;
  }
}
