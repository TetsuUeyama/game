import { Character } from "../entities/Character";
import { OffenseRole, DefenseRole } from "../state/PlayerStateTypes";
import { DEFAULT_FACE_CONFIG } from "../types/FaceConfig";
import { FaceAvatarRenderer } from "./FaceAvatarRenderer";

export interface FaceAvatarData {
  characterId: string;
  team: 'ally' | 'enemy';
  playerName: string;
  position: string;
  dataUrl: string;
  shotPriority: number | null;
  offenseRole: OffenseRole | null;
  defenseRole: DefenseRole | null;
}

/**
 * 各キャラクターの顔アバターを2D Canvas描画で生成するユーティリティ
 */
export class FaceAvatarCapture {
  /**
   * 全キャラクターの顔アバターを生成
   * （公開APIシグネチャは維持。sceneパラメータは後方互換のため残す）
   */
  static async captureAll(
    _scene: unknown,
    allyCharacters: Character[],
    enemyCharacters: Character[]
  ): Promise<FaceAvatarData[]> {
    const results: FaceAvatarData[] = [];

    for (const character of allyCharacters) {
      const fc = character.playerData?.faceConfig ?? DEFAULT_FACE_CONFIG;
      const dataUrl = FaceAvatarRenderer.render(fc);
      results.push({
        characterId: character.playerData?.basic.ID ?? '',
        team: 'ally',
        playerName: character.playerData?.basic.NAME ?? '',
        position: character.playerPosition ?? '',
        dataUrl,
        shotPriority: character.shotPriority,
        offenseRole: character.offenseRole,
        defenseRole: character.defenseRole,
      });
    }

    for (const character of enemyCharacters) {
      const fc = character.playerData?.faceConfig ?? DEFAULT_FACE_CONFIG;
      const dataUrl = FaceAvatarRenderer.render(fc);
      results.push({
        characterId: character.playerData?.basic.ID ?? '',
        team: 'enemy',
        playerName: character.playerData?.basic.NAME ?? '',
        position: character.playerPosition ?? '',
        dataUrl,
        shotPriority: character.shotPriority,
        offenseRole: character.offenseRole,
        defenseRole: character.defenseRole,
      });
    }

    return results;
  }
}
