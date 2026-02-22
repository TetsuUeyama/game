import { Character } from "@/GamePlay/Object/Entities/Character";
import { OffenseRole, DefenseRole } from "@/GamePlay/GameSystem/StatusCheckSystem/PlayerStateTypes";
import { DEFAULT_FACE_CONFIG } from "@/GamePlay/GameSystem/CharacterModel/Types/FaceConfig";
import { FaceAvatarRenderer } from "@/GamePlay/GameSystem/CharacterModel/FaceAvatar/FaceAvatarRenderer";

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
 * 各キャラクターの顔アバターを2D Canvas描画で生成するユーティリティ（キャッシュ付き）
 */
export class FaceAvatarCapture {
  private static cache: FaceAvatarData[] | null = null;

  /**
   * 全キャラクターの顔アバターを生成（キャッシュあり）
   */
  static async captureAll(
    allyCharacters: Character[],
    enemyCharacters: Character[]
  ): Promise<FaceAvatarData[]> {
    if (this.cache) {
      return this.cache;
    }

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

    this.cache = results;
    return results;
  }

  /**
   * キャッシュを無効化
   */
  static clearCache(): void {
    this.cache = null;
  }
}
