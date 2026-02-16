import { PlayerData, PlayerDataJSON, FaceConfigJSON } from "@/GamePlay/GameSystem/CharacterMove/Types/PlayerData";
import { FaceConfig, DEFAULT_FACE_CONFIG, ColorRGB } from "@/GamePlay/GameSystem/CharacterMove/Types/FaceConfig";
import { fetchAllPlayers } from "@/GamePlay/Management/Services/PlayerService";
import { DocumentData } from "firebase/firestore";

/**
 * 選手データローダー
 * Firestoreから選手データを読み込む
 */
export class PlayerDataLoader {
  private static cachedPlayers: Record<string, PlayerData> | null = null;
  private static loadPromise: Promise<Record<string, PlayerData>> | null = null;

  /**
   * JSONデータをPlayerData形式に変換
   */
  static convertToPlayerData(data: PlayerDataJSON): PlayerData {
    return {
      basic: {
        ID: data.ID,
        NAME: data.NAME,
        PositionMain: data.PositionMain,
        Position2: data.Position2,
        Position3: data.Position3,
        Position4: data.Position4,
        Position5: data.Position5,
        side: data.side,
        Position: data.Position,
        height: data.height,
        dominanthand: data.dominanthand,
      },
      stats: {
        offense: data.offense,
        defense: data.defense,
        power: data.power,
        stamina: data.stamina,
        speed: data.speed,
        acceleration: data.acceleration,
        reflexes: data.reflexes,
        quickness: data.quickness,
        dribblingaccuracy: data.dribblingaccuracy,
        dribblingspeed: data.dribblingspeed,
        passaccuracy: data.passaccuracy,
        passspeed: data.passspeed,
        '3paccuracy': data['3paccuracy'],
        '3pspeed': data['3pspeed'],
        shootccuracy: data.shootccuracy,
        shootdistance: data.shootdistance,
        shoottechnique: data.shoottechnique,
        freethrow: data.freethrow,
        curve: data.curve,
        dunk: data.dunk,
        jump: data.jump,
        technique: data.technique,
        mentality: data.mentality,
        aggressive: data.aggressive,
        alignment: data.alignment,
        condition: data.condition,
        oppositeaccuracy: data.oppositeaccuracy,
        oppositefrequency: data.oppositefrequency,
      },
      specialAbilities: {
        specialabilitiy1: data.specialabilitiy1,
        specialabilitiy2: data.specialabilitiy2,
        specialabilitiy3: data.specialabilitiy3,
        specialabilitiy4: data.specialabilitiy4,
        specialabilitiy5: data.specialabilitiy5,
        specialabilitiy6: data.specialabilitiy6,
        specialabilitiy7: data.specialabilitiy7,
        specialabilitiy8: data.specialabilitiy8,
        specialabilitiy9: data.specialabilitiy9,
        specialabilitiy10: data.specialabilitiy10,
        specialabilitiy11: data.specialabilitiy11,
        specialabilitiy12: data.specialabilitiy12,
        specialabilitiy13: data.specialabilitiy13,
        specialabilitiy14: data.specialabilitiy14,
        specialabilitiy15: data.specialabilitiy15,
        specialabilitiy16: data.specialabilitiy16,
        specialabilitiy17: data.specialabilitiy17,
        specialabilitiy18: data.specialabilitiy18,
        specialabilitiy19: data.specialabilitiy19,
        specialabilitiy20: data.specialabilitiy20,
        specialabilitiy22: data.specialabilitiy22,
      },
      faceConfig: data.faceConfig
        ? this.convertFaceConfig(data.faceConfig)
        : undefined,
    };
  }

  /**
   * JSON上の顔設定を FaceConfig に変換
   * 未指定のフィールドはデフォルト値で埋める
   */
  private static convertFaceConfig(json: FaceConfigJSON): FaceConfig {
    const d = DEFAULT_FACE_CONFIG;
    return {
      skinColor: this.toColorRGB(json.skinColor, d.skinColor),
      eyeColor: this.toColorRGB(json.eyeColor, d.eyeColor),
      eyeStyle: json.eyeStyle ?? d.eyeStyle,
      eyeSize: json.eyeSize ?? d.eyeSize,
      eyePositionY: json.eyePositionY ?? d.eyePositionY,
      mouthColor: this.toColorRGB(json.mouthColor, d.mouthColor),
      mouthStyle: json.mouthStyle ?? d.mouthStyle,
      mouthWidth: json.mouthWidth ?? d.mouthWidth,
      mouthPositionY: json.mouthPositionY ?? d.mouthPositionY,
      hairStyle: json.hairStyle ?? d.hairStyle,
      hairColor: this.toColorRGB(json.hairColor, d.hairColor),
      beardStyle: json.beardStyle ?? d.beardStyle,
      beardColor: this.toColorRGB(json.beardColor, d.beardColor),
    };
  }

  /**
   * [r, g, b] 配列を ColorRGB に変換（未指定ならデフォルト値）
   */
  private static toColorRGB(arr: number[] | undefined, fallback: ColorRGB): ColorRGB {
    if (arr && arr.length >= 3) {
      return { r: arr[0], g: arr[1], b: arr[2] };
    }
    return fallback;
  }

  /**
   * 選手データをFirestoreから読み込む
   * @returns 選手ID -> PlayerData のマップ
   */
  public static async loadPlayerData(): Promise<Record<string, PlayerData>> {
    // キャッシュがあればそれを返す
    if (this.cachedPlayers) {
      return this.cachedPlayers;
    }

    // 既に読み込み中の場合は、その Promise を返す（重複読み込み防止）
    if (this.loadPromise) {
      return this.loadPromise;
    }

    // Firestoreから読み込み開始
    this.loadPromise = (async () => {
      try {
        const firestoreData: Record<string, DocumentData> = await fetchAllPlayers();

        // FirestoreデータをPlayerData形式に変換
        const players: Record<string, PlayerData> = {};
        for (const [id, data] of Object.entries(firestoreData)) {
          players[id] = this.convertToPlayerData(data as PlayerDataJSON);
        }

        // キャッシュに保存
        this.cachedPlayers = players;

        return players;
      } catch (error) {
        console.error("[PlayerDataLoader] 選手データの読み込みに失敗しました:", error);
        // エラー時はキャッシュとPromiseをクリア
        this.cachedPlayers = null;
        this.loadPromise = null;
        throw error;
      }
    })();

    return this.loadPromise;
  }

  /**
   * 特定の選手データを取得
   * @param playerId 選手ID
   * @returns PlayerData（見つからない場合はundefined）
   */
  public static async getPlayerData(
    playerId: string
  ): Promise<PlayerData | undefined> {
    const players = await this.loadPlayerData();
    return players[playerId];
  }

  /**
   * すべての選手IDを取得
   * @returns 選手IDの配列
   */
  public static async getAllPlayerIds(): Promise<string[]> {
    const players = await this.loadPlayerData();
    return Object.keys(players);
  }

  /**
   * キャッシュをクリア（再読み込みが必要な場合に使用）
   */
  public static clearCache(): void {
    this.cachedPlayers = null;
    this.loadPromise = null;
  }
}
