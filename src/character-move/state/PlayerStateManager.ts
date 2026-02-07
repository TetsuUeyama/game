import { Vector3 } from "@babylonjs/core";
import { Character } from "../entities/Character";
import { Ball } from "../entities/Ball";
import { CharacterState } from "../types/CharacterState";
import { PlayerPosition } from "../config/FormationConfig";
import { getDistance2D } from "../utils/CollisionUtils";
import { PlayerStateSnapshot, TeamState, RadiusQueryOptions, OffenseRole, DefenseRole, DefenseScheme } from "./PlayerStateTypes";

/**
 * 全選手一括管理システム
 * 毎フレームスナップショットを構築し、効率的なクエリAPIを提供する
 */
export class PlayerStateManager {
  private ball: Ball;

  // 全スナップショット
  private snapshots: PlayerStateSnapshot[] = [];

  // インデックス: Character → Snapshot
  private characterIndex: Map<Character, PlayerStateSnapshot> = new Map();

  // インデックス: チーム別
  private allyPlayers: PlayerStateSnapshot[] = [];
  private enemyPlayers: PlayerStateSnapshot[] = [];

  // インデックス: 状態別
  private stateIndex: Map<CharacterState, PlayerStateSnapshot[]> = new Map();

  // インデックス: ポジション別
  private positionIndex: Map<PlayerPosition, PlayerStateSnapshot[]> = new Map();

  // インデックス: オフェンス役割別
  private offenseRoleIndex: Map<OffenseRole, PlayerStateSnapshot[]> = new Map();

  // インデックス: ディフェンス役割別
  private defenseRoleIndex: Map<DefenseRole, PlayerStateSnapshot[]> = new Map();

  // ボール保持者
  private ballHolderSnapshot: PlayerStateSnapshot | null = null;

  // チーム守備スキーム
  private allyDefenseScheme: DefenseScheme = DefenseScheme.DROP;
  private enemyDefenseScheme: DefenseScheme = DefenseScheme.DROP;

  constructor(ball: Ball) {
    this.ball = ball;
  }

  /**
   * チーム守備スキームを設定
   */
  public setDefenseScheme(team: 'ally' | 'enemy', scheme: DefenseScheme): void {
    if (team === 'ally') {
      this.allyDefenseScheme = scheme;
    } else {
      this.enemyDefenseScheme = scheme;
    }
  }

  /**
   * チーム守備スキームを取得
   */
  public getDefenseScheme(team: 'ally' | 'enemy'): DefenseScheme {
    return team === 'ally' ? this.allyDefenseScheme : this.enemyDefenseScheme;
  }

  // ============================================
  // 更新
  // ============================================

  /**
   * 毎フレーム呼出 - 全選手のスナップショットを再構築
   */
  public update(allCharacters: Character[]): void {
    const holder = this.ball.getHolder();

    // インデックスをクリア
    this.snapshots = [];
    this.characterIndex.clear();
    this.allyPlayers = [];
    this.enemyPlayers = [];
    this.stateIndex.clear();
    this.positionIndex.clear();
    this.offenseRoleIndex.clear();
    this.defenseRoleIndex.clear();
    this.ballHolderSnapshot = null;

    // 全選手のスナップショットを作成
    for (const character of allCharacters) {
      const snapshot: PlayerStateSnapshot = {
        character,
        position: character.getPosition(),
        velocity: character.velocity.clone(),
        team: character.team,
        state: character.getState(),
        playerPosition: character.playerPosition as PlayerPosition | null,
        offenseRole: character.offenseRole,
        defenseRole: character.defenseRole,
        shotPriority: character.shotPriority,
        hasBall: character === holder,
        speedStat: character.playerData?.stats.speed ?? 50,
      };

      this.snapshots.push(snapshot);
      this.characterIndex.set(character, snapshot);

      // チーム別インデックス
      if (snapshot.team === 'ally') {
        this.allyPlayers.push(snapshot);
      } else {
        this.enemyPlayers.push(snapshot);
      }

      // 状態別インデックス
      let stateList = this.stateIndex.get(snapshot.state);
      if (!stateList) {
        stateList = [];
        this.stateIndex.set(snapshot.state, stateList);
      }
      stateList.push(snapshot);

      // ポジション別インデックス
      if (snapshot.playerPosition) {
        let posList = this.positionIndex.get(snapshot.playerPosition);
        if (!posList) {
          posList = [];
          this.positionIndex.set(snapshot.playerPosition, posList);
        }
        posList.push(snapshot);
      }

      // オフェンス役割別インデックス
      if (snapshot.offenseRole) {
        let offList = this.offenseRoleIndex.get(snapshot.offenseRole);
        if (!offList) {
          offList = [];
          this.offenseRoleIndex.set(snapshot.offenseRole, offList);
        }
        offList.push(snapshot);
      }

      // ディフェンス役割別インデックス
      if (snapshot.defenseRole) {
        let defList = this.defenseRoleIndex.get(snapshot.defenseRole);
        if (!defList) {
          defList = [];
          this.defenseRoleIndex.set(snapshot.defenseRole, defList);
        }
        defList.push(snapshot);
      }

      // ボール保持者
      if (snapshot.hasBall) {
        this.ballHolderSnapshot = snapshot;
      }
    }
  }

  // ============================================
  // 基本ルックアップ（O(1)）
  // ============================================

  /**
   * 全スナップショットを取得
   */
  public getAll(): readonly PlayerStateSnapshot[] {
    return this.snapshots;
  }

  /**
   * 特定選手のスナップショットを取得
   */
  public getSnapshot(character: Character): PlayerStateSnapshot | undefined {
    return this.characterIndex.get(character);
  }

  /**
   * ボール保持者のスナップショットを取得
   */
  public getBallHolder(): PlayerStateSnapshot | null {
    return this.ballHolderSnapshot;
  }

  /**
   * ボール保持者のCharacterを取得
   */
  public getBallHolderCharacter(): Character | null {
    return this.ballHolderSnapshot?.character ?? null;
  }

  /**
   * チーム状態を取得
   */
  public getTeamState(team: 'ally' | 'enemy'): TeamState {
    const players = team === 'ally' ? this.allyPlayers : this.enemyPlayers;
    const ballHolder = this.ballHolderSnapshot?.team === team ? this.ballHolderSnapshot : null;

    return {
      team,
      isOnOffense: ballHolder !== null,
      ballHolder,
      players,
      defenseScheme: team === 'ally' ? this.allyDefenseScheme : this.enemyDefenseScheme,
    };
  }

  /**
   * チームがオフェンス中かどうか
   */
  public isTeamOnOffense(team: 'ally' | 'enemy'): boolean {
    return this.ballHolderSnapshot?.team === team;
  }

  // ============================================
  // インデックスクエリ
  // ============================================

  /**
   * チーム別の選手を取得
   */
  public getPlayersByTeam(team: 'ally' | 'enemy'): readonly PlayerStateSnapshot[] {
    return team === 'ally' ? this.allyPlayers : this.enemyPlayers;
  }

  /**
   * チームメイトを取得（自分除く）
   */
  public getTeammates(self: Character): PlayerStateSnapshot[] {
    const selfSnapshot = this.characterIndex.get(self);
    if (!selfSnapshot) return [];

    const teamPlayers = selfSnapshot.team === 'ally' ? this.allyPlayers : this.enemyPlayers;
    return teamPlayers.filter(s => s.character !== self);
  }

  /**
   * 相手チームの選手を取得
   */
  public getOpponents(self: Character): readonly PlayerStateSnapshot[] {
    const selfSnapshot = this.characterIndex.get(self);
    if (!selfSnapshot) return [];

    return selfSnapshot.team === 'ally' ? this.enemyPlayers : this.allyPlayers;
  }

  /**
   * 状態別の選手を取得
   */
  public getPlayersByState(state: CharacterState): readonly PlayerStateSnapshot[] {
    return this.stateIndex.get(state) ?? [];
  }

  /**
   * ポジション別の選手を取得
   */
  public getPlayersByPosition(position: PlayerPosition): readonly PlayerStateSnapshot[] {
    return this.positionIndex.get(position) ?? [];
  }

  /**
   * オフェンス役割別の選手を取得
   */
  public getPlayersByOffenseRole(role: OffenseRole): readonly PlayerStateSnapshot[] {
    return this.offenseRoleIndex.get(role) ?? [];
  }

  /**
   * ディフェンス役割別の選手を取得
   */
  public getPlayersByDefenseRole(role: DefenseRole): readonly PlayerStateSnapshot[] {
    return this.defenseRoleIndex.get(role) ?? [];
  }

  /**
   * 特定チームの特定オフェンス役割の選手を取得
   */
  public getPlayersByTeamAndOffenseRole(team: 'ally' | 'enemy', role: OffenseRole): PlayerStateSnapshot[] {
    const rolePlayers = this.offenseRoleIndex.get(role) ?? [];
    return rolePlayers.filter(s => s.team === team);
  }

  /**
   * 特定チームの特定ディフェンス役割の選手を取得
   */
  public getPlayersByTeamAndDefenseRole(team: 'ally' | 'enemy', role: DefenseRole): PlayerStateSnapshot[] {
    const rolePlayers = this.defenseRoleIndex.get(role) ?? [];
    return rolePlayers.filter(s => s.team === team);
  }

  /**
   * チームのメインハンドラーを取得
   */
  public getMainHandler(team: 'ally' | 'enemy'): PlayerStateSnapshot | null {
    const handlers = this.getPlayersByTeamAndOffenseRole(team, OffenseRole.MAIN_HANDLER);
    return handlers.length > 0 ? handlers[0] : null;
  }

  /**
   * チームのシュート優先度順の選手リストを取得
   * shotPriorityが小さい順（1=ファーストチョイスが先頭）
   * shotPriority未設定の選手は末尾に配置
   */
  public getShootingPriorityOrder(team: 'ally' | 'enemy'): PlayerStateSnapshot[] {
    const players = team === 'ally' ? [...this.allyPlayers] : [...this.enemyPlayers];
    return players.sort((a, b) => {
      const pa = a.shotPriority ?? 999;
      const pb = b.shotPriority ?? 999;
      return pa - pb;
    });
  }

  // ============================================
  // 空間クエリ（XZ平面2D距離）
  // ============================================

  /**
   * 最寄り選手を検索
   * @param point 基準点
   * @param options チームフィルタ・除外オプション
   */
  public findNearestPlayer(
    point: Vector3,
    options?: { team?: 'ally' | 'enemy'; exclude?: Character }
  ): PlayerStateSnapshot | null {
    let nearest: PlayerStateSnapshot | null = null;
    let minDist = Infinity;

    const candidates = this.getCandidates(options?.team);

    for (const snapshot of candidates) {
      if (options?.exclude && snapshot.character === options.exclude) continue;

      const dist = getDistance2D(point, snapshot.position);
      if (dist < minDist) {
        minDist = dist;
        nearest = snapshot;
      }
    }

    return nearest;
  }

  /**
   * 半径内の全選手を検索
   */
  public findPlayersInRadius(options: RadiusQueryOptions): PlayerStateSnapshot[] {
    const results: PlayerStateSnapshot[] = [];
    const candidates = this.getCandidates(options.team);

    for (const snapshot of candidates) {
      if (options.exclude && snapshot.character === options.exclude) continue;

      const dist = getDistance2D(options.center, snapshot.position);
      if (dist <= options.radius) {
        results.push(snapshot);
      }
    }

    return results;
  }

  /**
   * 距離順にソートされた選手リストを取得
   * @param point 基準点
   * @param options チームフィルタ・除外オプション
   */
  public getPlayersSortedByDistance(
    point: Vector3,
    options?: { team?: 'ally' | 'enemy'; exclude?: Character }
  ): PlayerStateSnapshot[] {
    const candidates = this.getCandidates(options?.team);

    const filtered = options?.exclude
      ? candidates.filter(s => s.character !== options.exclude)
      : [...candidates];

    return filtered.sort((a, b) => {
      const distA = getDistance2D(point, a.position);
      const distB = getDistance2D(point, b.position);
      return distA - distB;
    });
  }

  /**
   * 最寄りの相手選手を検索
   */
  public findNearestOpponent(character: Character): PlayerStateSnapshot | null {
    const selfSnapshot = this.characterIndex.get(character);
    if (!selfSnapshot) return null;

    const opponentTeam: 'ally' | 'enemy' = selfSnapshot.team === 'ally' ? 'enemy' : 'ally';
    return this.findNearestPlayer(selfSnapshot.position, { team: opponentTeam });
  }

  // ============================================
  // 派生クエリ
  // ============================================

  /**
   * 全ディフェンダーを取得
   */
  public getAllDefenders(): PlayerStateSnapshot[] {
    const onBall = this.stateIndex.get(CharacterState.ON_BALL_DEFENDER) ?? [];
    const offBall = this.stateIndex.get(CharacterState.OFF_BALL_DEFENDER) ?? [];
    return [...onBall, ...offBall];
  }

  /**
   * 全オフェンス選手を取得
   */
  public getAllOffensePlayers(): PlayerStateSnapshot[] {
    const onBall = this.stateIndex.get(CharacterState.ON_BALL_PLAYER) ?? [];
    const offBall = this.stateIndex.get(CharacterState.OFF_BALL_PLAYER) ?? [];
    return [...onBall, ...offBall];
  }

  // ============================================
  // 内部ヘルパー
  // ============================================

  /**
   * チームフィルタに基づいて候補リストを取得
   */
  private getCandidates(team?: 'ally' | 'enemy'): readonly PlayerStateSnapshot[] {
    if (team === 'ally') return this.allyPlayers;
    if (team === 'enemy') return this.enemyPlayers;
    return this.snapshots;
  }
}
