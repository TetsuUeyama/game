import {
  Scene,
  Engine,
  ArcRotateCamera,
  HemisphericLight,
  DirectionalLight,
  Vector3,
  Color4,
} from "@babylonjs/core";
import { Character } from "../entities/Character";
import { Field } from "../entities/Field";
import { Ball } from "../entities/Ball";
import { InputController } from "../controllers/InputController";
import { JointController } from "../controllers/JointController";
import { CollisionHandler } from "../controllers/CollisionHandler";
import { CharacterAI } from "../controllers/CharacterAI";
import { DEFAULT_CHARACTER_CONFIG } from "../types/CharacterStats";
import { GameTeamConfig } from "../utils/TeamConfigLoader";
import { PlayerData } from "../types/PlayerData";
// import { ModelLoader } from "../utils/ModelLoader"; // 一旦無効化
import {
  CAMERA_CONFIG,
  LIGHT_CONFIG,
  // MODEL_CONFIG, // 一旦無効化
} from "../config/gameConfig";

/**
 * character-moveゲームのメインシーン
 */
export class GameScene {
  private engine: Engine;
  private scene: Scene;
  private camera: ArcRotateCamera;
  private field: Field;
  private ball: Ball;
  private inputController?: InputController;
  private jointController?: JointController;
  private collisionHandler?: CollisionHandler;

  // キャラクター（6対6）
  private allyCharacters: Character[] = []; // 味方チーム6人
  private enemyCharacters: Character[] = []; // 敵チーム6人

  // AIコントローラー
  private characterAIs: CharacterAI[] = [];

  // カメラターゲット切り替え用
  private currentTargetTeam: 'ally' | 'enemy' = 'ally';
  private currentTargetIndex: number = 0;

  private lastFrameTime: number = Date.now();

  // 1on1勝負の状態管理
  private was1on1: boolean = false;
  private in1on1Battle: boolean = false; // 1on1バトル中かどうか
  private lastDiceRollTime: number = 0; // 最後にサイコロを振った時刻
  private diceRollInterval: number = 1000; // サイコロを振る間隔（ミリ秒）
  private oneononeResult: { winner: 'offense' | 'defense'; offenseDice: number; defenseDice: number } | null = null;
  private lastCollisionRedirectTime: number = 0; // 最後に衝突で方向転換した時刻
  private collisionRedirectInterval: number = 300; // 方向転換の最小間隔（ミリ秒）

  // 3Dモデルロード状態
  private modelLoaded: boolean = false;

  // モーション確認モード（入力とモーション再生を停止）
  private isMotionConfirmationMode: boolean = false;

  constructor(canvas: HTMLCanvasElement, options?: {
    showAdditionalCharacters?: boolean;
    teamConfig?: GameTeamConfig;
    playerData?: Record<string, PlayerData>;
  }) {
    const showAdditionalCharacters = options?.showAdditionalCharacters ?? true;
    const teamConfig = options?.teamConfig;
    const playerData = options?.playerData;

    // WebGLサポートチェック
    if (!canvas.getContext("webgl") && !canvas.getContext("webgl2")) {
      throw new Error(
        "WebGL is not supported in this browser. Please use a modern browser that supports WebGL."
      );
    }

    // エンジンの作成
    try {
      this.engine = new Engine(canvas, true, {
        preserveDrawingBuffer: true,
        stencil: true,
      });
    } catch (error: unknown) {
      console.error("[GameScene] Engine creation failed:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to create Babylon.js engine: ${errorMessage}`);
    }

    // シーンの作成
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.5, 0.7, 0.9, 1.0); // 空色の背景

    // カメラの設定
    this.camera = this.createCamera(canvas);

    // ライトの設定
    this.createLights();

    // フィールドの作成
    this.field = new Field(this.scene);

    // ボールの作成
    this.ball = this.createBall();

    // キャラクターの作成（6対6）
    if (showAdditionalCharacters && teamConfig && playerData) {
      this.createTeams(teamConfig, playerData);
    } else if (!showAdditionalCharacters) {
      // モーション確認モードの場合、デフォルトキャラクターを1体作成
      const defaultCharacter = this.createCharacter();
      this.allyCharacters.push(defaultCharacter);
    }

    // 全キャラクターのリスト
    const allCharacters = [...this.allyCharacters, ...this.enemyCharacters];

    // 衝突判定コントローラーの初期化（キャラクターが存在する場合のみ）
    if (allCharacters.length > 0) {
      this.collisionHandler = new CollisionHandler(this.ball, allCharacters);
    }

    // AIコントローラーの初期化
    if (showAdditionalCharacters) {
      // 全キャラクターにAIコントローラーを設定
      for (const character of allCharacters) {
        const ai = new CharacterAI(character, this.ball, allCharacters, this.field);
        this.characterAIs.push(ai);
      }
      console.log(`[GameScene] ${this.characterAIs.length}人のAIコントローラーを初期化しました`);
    }

    // 入力コントローラーの初期化（プレイヤーキャラクター）
    if (allCharacters.length > 0) {
      this.inputController = new InputController(this.scene, allCharacters[0]);
      // 関節操作コントローラーの初期化（モーション選択UI含む）
      this.jointController = new JointController(this.scene, allCharacters[0]);
    }

    // 3Dモデルのロード（オプション）
    // this.loadCharacterModel(); // 一旦無効化

    // レンダーループの開始
    this.startRenderLoop();

    // ウィンドウリサイズ対応
    window.addEventListener("resize", () => {
      this.engine.resize();
    });

    console.log("[GameScene] character-moveゲーム初期化完了");
  }

  /**
   * カメラを作成
   */
  private createCamera(canvas: HTMLCanvasElement): ArcRotateCamera {
    // アークローテートカメラ（キャラクターを中心に回転）
    const camera = new ArcRotateCamera(
      "camera",
      -Math.PI / 2, // 初期水平角度（キャラクターの後ろ）
      Math.PI / 3, // 初期垂直角度（やや上から見下ろす）
      10, // 初期距離
      Vector3.Zero(), // 初期ターゲット
      this.scene
    );

    // カメラの制限
    camera.lowerRadiusLimit = 3; // 最小距離
    camera.upperRadiusLimit = 30; // 最大距離
    camera.lowerBetaLimit = 0.1; // 最小垂直角度（真上を防ぐ）
    camera.upperBetaLimit = Math.PI / 2.2; // 最大垂直角度（真下を防ぐ）

    // マウス操作を有効化
    camera.attachControl(canvas, true);

    return camera;
  }

  /**
   * ライトを作成
   */
  private createLights(): void {
    // 環境光（Hemispheric Light）
    const hemisphericLight = new HemisphericLight(
      "hemispheric-light",
      new Vector3(0, 1, 0),
      this.scene
    );
    hemisphericLight.intensity = LIGHT_CONFIG.ambient.intensity;

    // 太陽光（Directional Light）
    const directionalLight = new DirectionalLight(
      "directional-light",
      new Vector3(
        LIGHT_CONFIG.directional.direction.x,
        LIGHT_CONFIG.directional.direction.y,
        LIGHT_CONFIG.directional.direction.z
      ),
      this.scene
    );
    directionalLight.intensity = LIGHT_CONFIG.directional.intensity;
  }

  /**
   * チーム設定に基づいてキャラクターを作成（6対6）
   */
  private createTeams(teamConfig: GameTeamConfig, playerData: Record<string, PlayerData>): void {
    console.log('[GameScene] チームを作成中...');

    // 味方チーム作成
    for (const playerConfig of teamConfig.allyTeam.players) {
      const player = playerData[playerConfig.playerId];
      if (!player) {
        console.warn(`[GameScene] 選手ID ${playerConfig.playerId} のデータが見つかりません`);
        continue;
      }

      const config = DEFAULT_CHARACTER_CONFIG;
      const position = new Vector3(playerConfig.x, config.physical.height / 2, playerConfig.z);

      const character = new Character(this.scene, position, config);
      character.team = "ally";
      character.setPlayerData(player, playerConfig.position);

      // 選手の身長を反映（cm → m）
      const heightInMeters = player.basic.height / 100;
      character.setHeight(heightInMeters);

      // 味方チームの胴体を青くする
      character.setBodyColor(0.0, 0.4, 1.0);

      this.allyCharacters.push(character);

      console.log(`[GameScene] 味方チーム: ${player.basic.NAME} (${playerConfig.position}、身長: ${player.basic.height}cm) を作成`);
    }

    // 敵チーム作成
    for (const playerConfig of teamConfig.enemyTeam.players) {
      const player = playerData[playerConfig.playerId];
      if (!player) {
        console.warn(`[GameScene] 選手ID ${playerConfig.playerId} のデータが見つかりません`);
        continue;
      }

      const config = DEFAULT_CHARACTER_CONFIG;
      const position = new Vector3(playerConfig.x, config.physical.height / 2, playerConfig.z);

      const character = new Character(this.scene, position, config);
      character.team = "enemy";
      character.setPlayerData(player, playerConfig.position);

      // 選手の身長を反映（cm → m）
      const heightInMeters = player.basic.height / 100;
      character.setHeight(heightInMeters);

      // 敵チームの胴体を赤くする
      character.setBodyColor(1.0, 0.0, 0.0);

      this.enemyCharacters.push(character);

      console.log(`[GameScene] 敵チーム: ${player.basic.NAME} (${playerConfig.position}、身長: ${player.basic.height}cm) を作成`);
    }

    console.log(`[GameScene] チーム作成完了: 味方${this.allyCharacters.length}人, 敵${this.enemyCharacters.length}人`);
  }

  /**
   * キャラクターを作成（プレイヤー）- 旧バージョン（使用しない）
   */
  private createCharacter(): Character {
    // デフォルト設定を使用
    const config = DEFAULT_CHARACTER_CONFIG;

    // 初期位置（フィールドの中央）
    const initialPosition = new Vector3(0, config.physical.height / 2, 0);

    const character = new Character(this.scene, initialPosition, config);

    // プレイヤーは味方チーム
    character.setTeam("ally");

    console.log(`[GameScene] プレイヤーキャラクター作成完了 (${config.basic.name}, 身長: ${config.physical.height}m)`);

    return character;
  }

  /**
   * ボールを作成
   */
  private createBall(): Ball {
    // プレイヤーの前方に配置（半径0.25mなので、地面からの高さは0.25m）
    const initialPosition = new Vector3(0, 0.25, 2);

    const ball = new Ball(this.scene, initialPosition);

    console.log("[GameScene] ボール作成完了");

    return ball;
  }

  /**
   * 味方キャラクターを作成
   */
  private createAlly(): Character {
    // デフォルト設定を使用
    const config = DEFAULT_CHARACTER_CONFIG;

    // プレイヤーの右側に配置
    const initialPosition = new Vector3(3, config.physical.height / 2, 2);

    const ally = new Character(this.scene, initialPosition, config);

    // 味方は緑色で表示
    ally.setColor(0.3, 0.8, 0.3);

    // チームを味方に設定
    ally.setTeam("ally");

    console.log(`[GameScene] 味方キャラクター作成完了 (${config.basic.name}, 身長: ${config.physical.height}m)`);

    return ally;
  }

  /**
   * 敵キャラクター1を作成
   */
  private createEnemy1(): Character {
    // デフォルト設定を使用
    const config = DEFAULT_CHARACTER_CONFIG;

    // プレイヤーの前方左側に配置
    const initialPosition = new Vector3(-4, config.physical.height / 2, 5);

    const enemy = new Character(this.scene, initialPosition, config);

    // 敵は赤色で表示
    enemy.setColor(0.9, 0.2, 0.2);

    // チームを敵に設定
    enemy.setTeam("enemy");

    console.log(`[GameScene] 敵キャラクター1作成完了 (${config.basic.name}, 身長: ${config.physical.height}m)`);

    return enemy;
  }

  /**
   * 敵キャラクター2を作成
   */
  private createEnemy2(): Character {
    // デフォルト設定を使用
    const config = DEFAULT_CHARACTER_CONFIG;

    // プレイヤーの前方右側に配置
    const initialPosition = new Vector3(4, config.physical.height / 2, 5);

    const enemy = new Character(this.scene, initialPosition, config);

    // 敵は赤色で表示
    enemy.setColor(0.9, 0.2, 0.2);

    // チームを敵に設定
    enemy.setTeam("enemy");

    console.log(`[GameScene] 敵キャラクター2作成完了 (${config.basic.name}, 身長: ${config.physical.height}m)`);

    return enemy;
  }

  /**
   * 3Dモデルをロード（オプション）
   * 現在は無効化中（@babylonjs/loadersパッケージが必要）

  private async loadCharacterModel(): Promise<void> {
    try {
      console.log("[GameScene] 3Dモデルのロードを試行中...");

      // モデルパスを取得
      const modelPath = MODEL_CONFIG.defaultModelPath;

      // モデルをロード
      const model = await ModelLoader.loadGLTF(this.scene, modelPath);

      // スケールを設定
      ModelLoader.setScale(model, MODEL_CONFIG.scale);

      // 回転を設定
      ModelLoader.setRotation(
        model,
        MODEL_CONFIG.rotationOffset.x,
        MODEL_CONFIG.rotationOffset.y,
        MODEL_CONFIG.rotationOffset.z
      );

      // キャラクターにモデルを設定
      this.character.setModel(model);

      this.modelLoaded = true;
      console.log("[GameScene] 3Dモデルのロードに成功しました");
    } catch (error) {
      console.warn(
        "[GameScene] 3Dモデルのロードに失敗しました。仮のメッシュを使用します。",
        error
      );
      // モデルのロードに失敗した場合は、仮のメッシュをそのまま使用
      this.modelLoaded = false;
    }
  }
  */

  /**
   * レンダーループを開始
   */
  private startRenderLoop(): void {
    this.engine.runRenderLoop(() => {
      // デルタタイムを計算
      const currentTime = Date.now();
      const deltaTime = (currentTime - this.lastFrameTime) / 1000;
      this.lastFrameTime = currentTime;

      // 更新処理
      this.update(deltaTime);

      // シーンをレンダリング
      this.scene.render();
    });
  }

  /**
   * 更新処理（毎フレーム）
   */
  private update(deltaTime: number): void {
    // モーション確認モードでは入力とモーション再生をスキップ
    if (!this.isMotionConfirmationMode) {
      // 入力コントローラーを更新
      if (this.inputController) {
        this.inputController.update(deltaTime);
      }

      // 全キャラクターを更新
      const allCharacters = [...this.allyCharacters, ...this.enemyCharacters];
      for (const character of allCharacters) {
        character.update(deltaTime);
      }

      // ドリブル突破中の処理
      this.updateDribbleBreakthrough(deltaTime, allCharacters);

      // AI移動を衝突判定付きで適用（1on1バトル中）
      if (this.in1on1Battle) {
        // オフェンス側の衝突を検知して動き直す処理
        let onBallPlayer: Character | null = null;
        let onBallDefender: Character | null = null;

        // オンボールプレイヤーとディフェンダーを探す
        for (const char of allCharacters) {
          const state = char.getState();
          if (state === "ON_BALL_PLAYER") {
            onBallPlayer = char;
          } else if (state === "ON_BALL_DEFENDER") {
            onBallDefender = char;
          }
        }

        // オフェンス側の移動を試行
        let offenseCollided = false;
        if (onBallPlayer) {
          offenseCollided = onBallPlayer.applyAIMovementWithCollision(deltaTime, allCharacters);
        }

        // ディフェンス側の移動を試行
        if (onBallDefender) {
          onBallDefender.applyAIMovementWithCollision(deltaTime, allCharacters);
        }

        // サークルが接触しているかチェック
        let circlesInContact = false;
        if (onBallPlayer && onBallDefender) {
          const distance = Vector3.Distance(
            new Vector3(onBallPlayer.getPosition().x, 0, onBallPlayer.getPosition().z),
            new Vector3(onBallDefender.getPosition().x, 0, onBallDefender.getPosition().z)
          );
          const contactDistance = onBallPlayer.getFootCircleRadius() + onBallDefender.getFootCircleRadius();
          circlesInContact = distance <= contactDistance + 0.1; // 少し余裕を持たせる
        }

        // オフェンスが衝突した場合、またはサークルが接触している場合、動き直す
        if ((offenseCollided || circlesInContact) && onBallPlayer && onBallDefender) {
          const currentTime = Date.now();
          if (currentTime - this.lastCollisionRedirectTime >= this.collisionRedirectInterval) {
            // 新しいランダム方向を設定
            const newDirection = this.getRandomDirection8();

            // オフェンス側の速度をdribblingspeedで調整
            const baseMoveSpeed = 3.0;
            let moveSpeed = baseMoveSpeed;
            const offenseData = onBallPlayer.playerData;
            if (offenseData && offenseData.stats.dribblingspeed !== undefined) {
              moveSpeed = baseMoveSpeed * (offenseData.stats.dribblingspeed / 100);
            }

            // フェイント判定
            const isFeint = this.checkFeint(onBallPlayer);

            if (isFeint) {
              // フェイント発動：オフェンスは動かないが、ディフェンスはフェイント方向に釣られる
              console.log(`[GameScene] 動き直しでフェイント発動！(衝突=${offenseCollided}, 接触=${circlesInContact})`);
              onBallPlayer.clearAIMovement(); // オフェンスは動かない

              // ディフェンスはフェイント方向に釣られて動く（動き直しなのでquicknessを使用）
              this.setDefenderFeintReaction(onBallDefender, newDirection, moveSpeed, true);
            } else {
              console.log(`[GameScene] 動き直し発生！(衝突=${offenseCollided}, 接触=${circlesInContact})`);

              // オフェンス側の動き直し遅延時間を計算（(100 - quickness) * 10 ミリ秒）
              // 例：quickness=83 → (100-83)*10 = 170ms、quickness=90 → (100-90)*10 = 100ms
              const offensePlayerData = onBallPlayer.playerData;
              let offenseDelayMs = 1000; // デフォルト1秒

              if (offensePlayerData && offensePlayerData.stats.quickness !== undefined) {
                const quickness = offensePlayerData.stats.quickness;
                offenseDelayMs = Math.max(0, (100 - quickness) * 10); // (100 - quickness) * 10ms（最小0ms）
                console.log(`[GameScene] オフェンス動き直し遅延: ${offenseDelayMs}ms (quickness=${quickness})`);
              } else {
                console.log(`[GameScene] オフェンスのquicknessデータなし、デフォルト遅延: ${offenseDelayMs}ms`);
              }

              onBallPlayer.setAIMovement(newDirection, moveSpeed, offenseDelayMs);

              // ディフェンスもオフェンスとゴールの間に位置取る（動き直しなのでquicknessを使用）
              this.setDefenderReaction(onBallPlayer, onBallDefender, newDirection, moveSpeed, true);
            }

            // 最後に方向転換した時刻を更新
            this.lastCollisionRedirectTime = currentTime;
          }
        }

        // その他のキャラクターも移動
        for (const character of allCharacters) {
          if (character !== onBallPlayer && character !== onBallDefender) {
            character.applyAIMovementWithCollision(deltaTime, allCharacters);
          }
        }
      }

      // 全AIコントローラーを更新
      for (const ai of this.characterAIs) {
        ai.update(deltaTime);
      }

      // カメラをプレイヤーキャラクターに追従させる
      this.updateCamera(deltaTime);
    }

    // ボールを更新（保持中はキャラクターに追従）
    this.ball.update(deltaTime);

    // フィールドを更新（ネットの物理シミュレーション）
    this.field.update(deltaTime);

    // 衝突判定を常に更新
    if (this.collisionHandler) {
      this.collisionHandler.update(deltaTime);
    }

    // 関節操作コントローラーは常に更新（Ctrl+ドラッグ用）
    if (this.jointController) {
      this.jointController.update(deltaTime);
    }

    // 1on1状態の変化をチェック
    this.check1on1Battle();
  }

  /**
   * 1on1の勝負をチェック
   */
  private check1on1Battle(): void {
    const is1on1Now = this.is1on1State();

    // 1on1状態に突入した瞬間（false → true）
    if (!this.was1on1 && is1on1Now) {
      console.log('[GameScene] 1on1バトル開始！');
      this.in1on1Battle = true;

      // 開始直後に即座にサイコロを振って移動開始
      this.perform1on1Battle();
      this.lastDiceRollTime = Date.now();
    }

    // 1on1状態から抜けた瞬間（true → false）
    if (this.was1on1 && !is1on1Now) {
      console.log('[GameScene] 1on1バトル終了');
      this.in1on1Battle = false;

      // AI移動をクリア
      const allCharacters = [...this.allyCharacters, ...this.enemyCharacters];
      for (const char of allCharacters) {
        char.clearAIMovement();
      }
    }

    // 1on1バトル中は一定間隔でサイコロを振る
    if (this.in1on1Battle) {
      const currentTime = Date.now();
      if (currentTime - this.lastDiceRollTime >= this.diceRollInterval) {
        this.perform1on1Battle();
        this.lastDiceRollTime = currentTime;
      }
    }

    this.was1on1 = is1on1Now;
  }

  /**
   * 1on1の勝負を実行（サイコロを振る）
   */
  private perform1on1Battle(): void {
    const allCharacters = [...this.allyCharacters, ...this.enemyCharacters];

    // オンボールプレイヤーとディフェンダーを探す
    let onBallPlayer: Character | null = null;
    let onBallDefender: Character | null = null;

    for (const char of allCharacters) {
      const state = char.getState();
      if (state === "ON_BALL_PLAYER") {
        onBallPlayer = char;
      } else if (state === "ON_BALL_DEFENDER") {
        onBallDefender = char;
      }
    }

    if (!onBallPlayer || !onBallDefender) {
      return;
    }

    // ドリブル突破中は何もしない
    if (onBallPlayer.isInDribbleBreakthrough()) {
      return;
    }

    // ボールが0番面の時、ランダムでドリブル突破を実行
    const currentFace = onBallPlayer.getCurrentBallFace();
    if (currentFace === 0) {
      const breakthroughChance = 0.3; // 30%の確率でドリブル突破
      if (Math.random() < breakthroughChance) {
        // 左右ランダムで突破方向を決定
        const direction = Math.random() < 0.5 ? 'left' : 'right';
        const success = onBallPlayer.startDribbleBreakthrough(direction);
        if (success) {
          onBallPlayer.clearAIMovement();
          console.log(`[GameScene] AIがドリブル突破を選択: ${direction}方向`);
          return; // 突破を開始したので通常処理をスキップ
        }
      }
    }

    // サイコロを振る（1〜6）
    const offenseDice = Math.floor(Math.random() * 6) + 1;
    const defenseDice = Math.floor(Math.random() * 6) + 1;

    // オフェンス側：ボール保持位置をランダムに変更
    onBallPlayer.randomizeBallPosition();

    // オフェンス側：8方向のランダムな移動を設定
    const randomDirection = this.getRandomDirection8();
    const baseMoveSpeed = 3.0; // 基準歩行速度

    // オフェンス側の速度をdribblingspeedで調整（dribblingspeed / 100 を倍率として適用）
    const offensePlayerData = onBallPlayer.playerData;
    let offenseMoveSpeed = baseMoveSpeed;
    if (offensePlayerData && offensePlayerData.stats.dribblingspeed !== undefined) {
      const dribblingSpeedMultiplier = offensePlayerData.stats.dribblingspeed / 100;
      offenseMoveSpeed = baseMoveSpeed * dribblingSpeedMultiplier;
      console.log(`[GameScene] オフェンス速度: ${offenseMoveSpeed.toFixed(2)} (dribblingspeed=${offensePlayerData.stats.dribblingspeed})`);
    }
    const moveSpeed = offenseMoveSpeed;

    // フェイント判定：technique値に基づいて確率を決定
    const isFeint = this.checkFeint(onBallPlayer);

    if (isFeint) {
      // フェイント発動：オフェンスは動かないが、ディフェンスはフェイント方向に釣られる
      console.log('[GameScene] フェイント発動！オフェンスは動かずにディフェンスを釣る');
      onBallPlayer.clearAIMovement(); // オフェンスは動かない

      // ディフェンスはフェイント方向に釣られて動く
      this.setDefenderFeintReaction(onBallDefender, randomDirection, moveSpeed);
    } else {
      // 通常移動：オフェンスも動く
      onBallPlayer.setAIMovement(randomDirection, moveSpeed, 0);

      // ディフェンス側：オフェンスの動きに対応
      this.setDefenderReaction(onBallPlayer, onBallDefender, randomDirection, moveSpeed);
    }

    console.log(`[GameScene] サイコロ結果: オフェンス=${offenseDice}, ディフェンス=${defenseDice}, フェイント=${isFeint}`);

    
    if (offenseDice > defenseDice) {
      console.log('[GameScene] オフェンス勝利！');
      this.oneononeResult = { winner: 'offense', offenseDice, defenseDice };
    } else if (defenseDice > offenseDice) {
      console.log('[GameScene] ディフェンス勝利！');
      this.oneononeResult = { winner: 'defense', offenseDice, defenseDice };
    } else {
      console.log('[GameScene] 引き分け！');
      this.oneononeResult = null; // 引き分けの場合は結果をクリア
    }
  }

  /**
   * ディフェンダーの対応動作を設定
   * オフェンスとゴールを結ぶ直線上に位置取り、0番の辺をオフェンスに向ける
   * @param offense オフェンス側キャラクター
   * @param defender ディフェンダー側キャラクター
   * @param _offenseDirection オフェンスの移動方向（未使用、互換性のため残す）
   * @param speed 移動速度
   * @param isRedirect 動き直しかどうか（trueの場合はquicknessを使用、falseの場合はreflexesを使用）
   */
  private setDefenderReaction(
    offense: Character,
    defender: Character,
    _offenseDirection: Vector3,
    speed: number,
    isRedirect: boolean = false
  ): void {
    const offensePos = offense.getPosition();
    const defenderPos = defender.getPosition();

    // 1. 守るゴールの位置を決定（ディフェンダーのチームに応じて）
    // 味方チーム(ally)はゴール2（手前側、Z=-25）を守る
    // 敵チーム(enemy)はゴール1（奥側、Z=+25）を守る
    const goalZ = defender.team === "ally" ? -25 : 25;
    const goalPosition = new Vector3(0, 0, goalZ);

    // 2. オフェンス→ゴールの方向ベクトルを計算
    const offenseToGoal = goalPosition.subtract(offensePos);
    offenseToGoal.y = 0; // XZ平面上で計算
    const distanceToGoal = offenseToGoal.length();

    if (distanceToGoal < 0.1) {
      // オフェンスがゴール上にいる場合は何もしない
      return;
    }

    const directionToGoal = offenseToGoal.normalize();

    // 3. 目標位置を計算：オフェンスからゴール方向に、サークルが接触する距離
    // オフェンスのサークル半径 + ディフェンダーのサークル半径
    const offenseRadius = offense.getFootCircleRadius();
    const defenderRadius = defender.getFootCircleRadius();
    const contactDistance = offenseRadius + defenderRadius;

    // 目標位置：オフェンスからゴール方向にcontactDistance進んだ位置
    const targetPosition = offensePos.add(directionToGoal.scale(contactDistance));

    // 4. ディフェンダーの向きを設定（0番の辺がオフェンス方向を向くように）
    // オフェンスへの方向
    const directionToOffense = offensePos.subtract(targetPosition);
    directionToOffense.y = 0;

    if (directionToOffense.length() > 0.01) {
      const targetRotation = Math.atan2(directionToOffense.x, directionToOffense.z);
      defender.setRotation(targetRotation);
    }

    // 5. 現在位置から目標位置への移動方向を計算
    const moveDirection = targetPosition.subtract(defenderPos);
    moveDirection.y = 0;

    const distanceToTarget = moveDirection.length();

    if (distanceToTarget < 0.05) {
      // 既に目標位置にいる場合は移動しない
      defender.clearAIMovement();
      return;
    }

    const normalizedDirection = moveDirection.normalize();

    // 6. ディフェンダーの遅延時間を計算
    const defenderPlayerData = defender.playerData;
    let reactionDelayMs = 1000; // デフォルト1秒

    if (isRedirect) {
      // 動き直しの場合：quicknessを使用（(100 - quickness) * 10 ミリ秒）
      if (defenderPlayerData && defenderPlayerData.stats.quickness !== undefined) {
        const quickness = defenderPlayerData.stats.quickness;
        reactionDelayMs = Math.max(0, (100 - quickness) * 10); // 最小0ms
        console.log(`[GameScene] ディフェンダー動き直し遅延: ${reactionDelayMs}ms (quickness=${quickness})`);
      } else {
        console.log(`[GameScene] ディフェンダーのquicknessデータなし、デフォルト遅延: ${reactionDelayMs}ms`);
      }
    } else {
      // 通常の反応：reflexesを使用（1000ms - reflexes値）
      if (defenderPlayerData && defenderPlayerData.stats.reflexes !== undefined) {
        const reflexes = defenderPlayerData.stats.reflexes;
        reactionDelayMs = Math.max(0, 1000 - reflexes); // 最小0ms
        console.log(`[GameScene] ディフェンダー反応遅延: ${reactionDelayMs}ms (reflexes=${reflexes})`);
      } else {
        console.log(`[GameScene] ディフェンダーのreflexesデータなし、デフォルト遅延: ${reactionDelayMs}ms`);
      }
    }

    // 7. ディフェンダーの移動を設定（遅延時間付き）
    defender.setAIMovement(normalizedDirection, speed, reactionDelayMs);

    console.log(`[GameScene] ディフェンダー目標位置: (${targetPosition.x.toFixed(2)}, ${targetPosition.z.toFixed(2)}), 距離=${distanceToTarget.toFixed(2)}m`);
  }

  /**
   * フェイント時のディフェンダー反応
   * ディフェンダーがフェイントの方向に釣られて動く
   * @param defender ディフェンダー
   * @param feintDirection フェイントの方向（オフェンスが動くふりをした方向）
   * @param speed 移動速度
   * @param isRedirect 動き直しかどうか
   */
  private setDefenderFeintReaction(
    defender: Character,
    feintDirection: Vector3,
    speed: number,
    isRedirect: boolean = false
  ): void {
    // ディフェンダーの遅延時間を計算
    const defenderPlayerData = defender.playerData;
    let reactionDelayMs = 1000; // デフォルト1秒

    if (isRedirect) {
      // 動き直しの場合：quicknessを使用
      if (defenderPlayerData && defenderPlayerData.stats.quickness !== undefined) {
        const quickness = defenderPlayerData.stats.quickness;
        reactionDelayMs = Math.max(0, (100 - quickness) * 10);
        console.log(`[GameScene] フェイント釣られ遅延: ${reactionDelayMs}ms (quickness=${quickness})`);
      }
    } else {
      // 通常の反応：reflexesを使用
      if (defenderPlayerData && defenderPlayerData.stats.reflexes !== undefined) {
        const reflexes = defenderPlayerData.stats.reflexes;
        reactionDelayMs = Math.max(0, 1000 - reflexes);
        console.log(`[GameScene] フェイント釣られ遅延: ${reactionDelayMs}ms (reflexes=${reflexes})`);
      }
    }

    // フェイント方向にディフェンダーを動かす
    // フェイント方向と同じ方向に動く（オフェンスを追いかけるように）
    const moveDirection = feintDirection.clone().normalize();

    // 移動を設定（釣られる動き）
    defender.setAIMovement(moveDirection, speed * 1.2, reactionDelayMs); // 少し速めに動く（焦って追いかける感じ）

    console.log(`[GameScene] ディフェンダーがフェイントに釣られる！方向=(${moveDirection.x.toFixed(2)}, ${moveDirection.z.toFixed(2)}), 速度=${speed * 1.2}`);
  }

  /**
   * 8方向のランダムな方向ベクトルを取得
   * @returns 正規化された方向ベクトル
   */
  private getRandomDirection8(): Vector3 {
    // 0-7のランダムな方向番号を選択
    const directionIndex = Math.floor(Math.random() * 8);

    // 各方向の角度（0=正面、反時計回り）
    const angle = (directionIndex * Math.PI) / 4; // 45度ずつ

    // キャラクターの現在の向きを考慮せず、ワールド座標系での方向を返す
    const x = Math.sin(angle);
    const z = Math.cos(angle);

    return new Vector3(x, 0, z).normalize();
  }

  /**
   * フェイント判定
   * オフェンスプレイヤーのtechnique値に基づいてフェイントを発動するか判定
   * @param offensePlayer オフェンスプレイヤー
   * @returns フェイントを発動する場合はtrue
   */
  private checkFeint(offensePlayer: Character): boolean {
    const playerData = offensePlayer.playerData;

    // フェイント発動確率を計算（technique / 200 = 最大50%の確率）
    // 例：technique=80 → 40%、technique=95 → 47.5%
    let feintChance = 0.2; // デフォルト20%

    if (playerData && playerData.stats.technique !== undefined) {
      const technique = playerData.stats.technique;
      feintChance = technique / 200; // technique / 200（最大50%）
      console.log(`[GameScene] フェイント確率: ${(feintChance * 100).toFixed(1)}% (technique=${technique})`);
    }

    // 乱数でフェイント発動を判定
    const roll = Math.random();
    return roll < feintChance;
  }

  /**
   * カメラの追従更新
   */
  private updateCamera(_deltaTime: number): void {
    // 現在のターゲットキャラクターを取得
    const targetCharacter = this.getCurrentTargetCharacter();
    if (!targetCharacter) return;

    // キャラクターの位置を取得
    const characterPosition = targetCharacter.getPosition();

    // カメラのターゲットをスムーズに移動
    const followSpeed = CAMERA_CONFIG.followSpeed;

    this.camera.target.x +=
      (characterPosition.x - this.camera.target.x) * followSpeed;
    this.camera.target.y +=
      (characterPosition.y - this.camera.target.y) * followSpeed;
    this.camera.target.z +=
      (characterPosition.z - this.camera.target.z) * followSpeed;
  }

  /**
   * 現在のターゲットキャラクターを取得
   */
  private getCurrentTargetCharacter(): Character | null {
    const characters = this.currentTargetTeam === 'ally' ? this.allyCharacters : this.enemyCharacters;
    if (characters.length === 0) return null;
    if (this.currentTargetIndex >= characters.length) {
      this.currentTargetIndex = 0;
    }
    return characters[this.currentTargetIndex];
  }

  /**
   * カメラターゲットを次のキャラクターに切り替え
   */
  public switchToNextCharacter(): void {
    const characters = this.currentTargetTeam === 'ally' ? this.allyCharacters : this.enemyCharacters;
    if (characters.length === 0) return;

    this.currentTargetIndex = (this.currentTargetIndex + 1) % characters.length;
    const character = characters[this.currentTargetIndex];
    console.log(`[GameScene] カメラターゲット: ${this.currentTargetTeam} ${this.currentTargetIndex + 1}人目 (${character.playerData?.basic.NAME || 'Unknown'})`);
  }

  /**
   * カメラターゲットを前のキャラクターに切り替え
   */
  public switchToPreviousCharacter(): void {
    const characters = this.currentTargetTeam === 'ally' ? this.allyCharacters : this.enemyCharacters;
    if (characters.length === 0) return;

    this.currentTargetIndex = (this.currentTargetIndex - 1 + characters.length) % characters.length;
    const character = characters[this.currentTargetIndex];
    console.log(`[GameScene] カメラターゲット: ${this.currentTargetTeam} ${this.currentTargetIndex + 1}人目 (${character.playerData?.basic.NAME || 'Unknown'})`);
  }

  /**
   * カメラターゲットのチームを切り替え
   */
  public switchTeam(): void {
    this.currentTargetTeam = this.currentTargetTeam === 'ally' ? 'enemy' : 'ally';
    this.currentTargetIndex = 0;
    const character = this.getCurrentTargetCharacter();
    console.log(`[GameScene] チーム切り替え: ${this.currentTargetTeam} 1人目 (${character?.playerData?.basic.NAME || 'Unknown'})`);
  }

  /**
   * 現在のターゲット情報を取得
   */
  public getCurrentTargetInfo(): { team: 'ally' | 'enemy'; index: number; character: Character | null } {
    return {
      team: this.currentTargetTeam,
      index: this.currentTargetIndex,
      character: this.getCurrentTargetCharacter(),
    };
  }

  /**
   * 1on1勝負の結果を取得
   */
  public get1on1Result(): { winner: 'offense' | 'defense'; offenseDice: number; defenseDice: number } | null {
    return this.oneononeResult;
  }

  /**
   * 1on1勝負の結果をクリア
   */
  public clear1on1Result(): void {
    this.oneononeResult = null;
  }

  /**
   * 現在のディフェンダーのサークル半径を取得
   * 注：エンドレスのサイコロ勝負では半径は変わらないため、常に1.0を返す
   */
  public getDefenderCircleRadius(): number {
    // 実際のオンボールディフェンダーのサークル半径を取得
    const onBallDefender = this.findOnBallDefender();
    if (onBallDefender) {
      return onBallDefender.getFootCircleRadius();
    }
    return 1.0; // デフォルト値
  }

  /**
   * 1on1バトル中かどうかを取得
   */
  public isIn1on1Battle(): boolean {
    return this.in1on1Battle;
  }

  /**
   * 無力化されたディフェンダーかチェック
   * 注：エンドレスのサイコロ勝負では無力化されないため、常にfalseを返す
   */
  public isDefeatedDefender(_character: Character): boolean {
    return false;
  }

  /**
   * オンボールディフェンダーを探す
   */
  private findOnBallDefender(): Character | null {
    const allCharacters = [...this.allyCharacters, ...this.enemyCharacters];
    for (const char of allCharacters) {
      const state = char.getState();
      if (state === "ON_BALL_DEFENDER") {
        return char;
      }
    }
    return null;
  }

  /**
   * 1on1状態かどうかを判定
   * @returns 1on1状態の場合true、それ以外false
   */
  public is1on1State(): boolean {
    const allCharacters = [...this.allyCharacters, ...this.enemyCharacters];

    // オンボールプレイヤーを探す
    let onBallPlayer: Character | null = null;
    let onBallDefender: Character | null = null;

    for (const char of allCharacters) {
      const state = char.getState();
      if (state === "ON_BALL_PLAYER") {
        onBallPlayer = char;
      } else if (state === "ON_BALL_DEFENDER") {
        onBallDefender = char;
      }
    }

    // 両方存在する場合のみチェック
    if (onBallPlayer && onBallDefender) {
      const distance = Vector3.Distance(
        onBallPlayer.getPosition(),
        onBallDefender.getPosition()
      );

      // サークルが重なる距離を動的に計算
      // オフェンスのサークル半径（1m）+ ディフェンダーのサークル半径（動的）
      const offenseRadius = 1.0;
      const defenderRadius = onBallDefender.getFootCircleRadius();
      const minDistance = offenseRadius + defenderRadius;

      const is1on1 = distance <= minDistance;

      // デバッグ用（最初の1秒だけログ出力）
      if (Date.now() % 1000 < 100) {
        console.log(`[GameScene] 1on1チェック: 距離=${distance.toFixed(2)}m, 最小距離=${minDistance.toFixed(2)}m, 1on1=${is1on1}`);
      }

      return is1on1;
    }

    return false;
  }

  /**
   * シーンを取得（外部からアクセス用）
   */
  public getScene(): Scene {
    return this.scene;
  }

  /**
   * エンジンを取得（外部からアクセス用）
   */
  public getEngine(): Engine {
    return this.engine;
  }

  /**
   * プレイヤーキャラクターを取得（外部からアクセス用）
   */
  public getCharacter(): Character | undefined {
    return this.allyCharacters[0];
  }

  /**
   * モーション再生を停止（モーション確認用）
   */
  public stopMotionPlayback(): void {
    // モーション確認モードを有効化（入力とモーション再生を停止）
    this.isMotionConfirmationMode = true;

    // 全キャラクターのモーションコントローラーを停止
    const allCharacters = [...this.allyCharacters, ...this.enemyCharacters];
    for (const character of allCharacters) {
      const motionController = character.getMotionController();
      motionController.stop();
    }

    console.log("[GameScene] モーション確認モードを有効化しました");
  }

  /**
   * 8角形の頂点番号を表示（デバッグ用）
   */
  public showOctagonVertexNumbers(): void {
    const allCharacters = [...this.allyCharacters, ...this.enemyCharacters];
    for (const character of allCharacters) {
      character.showOctagonVertexNumbers();
    }
  }

  /**
   * 8角形の頂点番号を非表示（デバッグ用）
   */
  public hideOctagonVertexNumbers(): void {
    const allCharacters = [...this.allyCharacters, ...this.enemyCharacters];
    for (const character of allCharacters) {
      character.hideOctagonVertexNumbers();
    }
  }

  /**
   * ドリブル突破を実行
   * @param direction 突破方向（'left' = 左前、'right' = 右前）
   * @returns 突破を開始できた場合はtrue
   */
  public performDribbleBreakthrough(direction: 'left' | 'right'): boolean {
    // オンボールプレイヤーを探す
    const allCharacters = [...this.allyCharacters, ...this.enemyCharacters];
    let onBallPlayer: Character | null = null;

    for (const char of allCharacters) {
      if (char.getState() === "ON_BALL_PLAYER") {
        onBallPlayer = char;
        break;
      }
    }

    if (!onBallPlayer) {
      console.log('[GameScene] ドリブル突破不可：オンボールプレイヤーがいません');
      return false;
    }

    // キャラクターのドリブル突破を開始
    const success = onBallPlayer.startDribbleBreakthrough(direction);

    if (success) {
      // 1on1バトル中の通常移動を一時停止
      onBallPlayer.clearAIMovement();
      console.log(`[GameScene] ドリブル突破開始: ${direction}方向`);
    }

    return success;
  }

  /**
   * ドリブル突破中の更新処理
   * @param deltaTime フレーム時間（秒）
   * @param allCharacters 全キャラクターのリスト
   */
  private updateDribbleBreakthrough(deltaTime: number, allCharacters: Character[]): void {
    // オンボールプレイヤーを探す
    let onBallPlayer: Character | null = null;
    let onBallDefender: Character | null = null;

    for (const char of allCharacters) {
      const state = char.getState();
      if (state === "ON_BALL_PLAYER") {
        onBallPlayer = char;
      } else if (state === "ON_BALL_DEFENDER") {
        onBallDefender = char;
      }
    }

    // オンボールプレイヤーがドリブル突破中の場合
    if (onBallPlayer && onBallPlayer.isInDribbleBreakthrough()) {
      // 突破移動を適用（衝突判定無視）
      const breakthroughEnded = onBallPlayer.applyBreakthroughMovement(deltaTime);

      if (breakthroughEnded) {
        // 突破終了
        onBallPlayer.endDribbleBreakthrough();

        // 衝突判定を行い、衝突している場合はpowerによる押し返しを計算
        if (onBallDefender) {
          const offensePos = onBallPlayer.getPosition();
          const defenderPos = onBallDefender.getPosition();
          const distance = Vector3.Distance(
            new Vector3(offensePos.x, 0, offensePos.z),
            new Vector3(defenderPos.x, 0, defenderPos.z)
          );

          const minDistance = onBallPlayer.getFootCircleRadius() + onBallDefender.getFootCircleRadius();

          if (distance < minDistance) {
            // 衝突している場合、power差による押し返しを計算
            console.log('[GameScene] ドリブル突破後の衝突発生！押し返し計算を実行');

            const { selfPush, otherPush } = onBallPlayer.calculatePushback(onBallDefender);

            // 押し返しを適用
            const newOffensePos = offensePos.add(selfPush);
            const newDefenderPos = defenderPos.add(otherPush);

            onBallPlayer.setPosition(newOffensePos);
            onBallDefender.setPosition(newDefenderPos);

            console.log(`[GameScene] 押し返し適用: オフェンス移動(${selfPush.x.toFixed(2)}, ${selfPush.z.toFixed(2)}), ディフェンス移動(${otherPush.x.toFixed(2)}, ${otherPush.z.toFixed(2)})`);
          } else {
            console.log('[GameScene] ドリブル突破成功！衝突なし');
          }
        }

        // 通常の1on1バトルを再開（新しい方向で動き直す）
        if (this.in1on1Battle && onBallPlayer && onBallDefender) {
          const newDirection = this.getRandomDirection8();

          // オフェンス側の速度をdribblingspeedで調整
          const baseMoveSpeed = 3.0;
          let moveSpeed = baseMoveSpeed;
          const offenseData = onBallPlayer.playerData;
          if (offenseData && offenseData.stats.dribblingspeed !== undefined) {
            moveSpeed = baseMoveSpeed * (offenseData.stats.dribblingspeed / 100);
          }

          // オフェンス側の動き直し遅延時間を計算
          let offenseDelayMs = 1000;
          if (offenseData && offenseData.stats.quickness !== undefined) {
            offenseDelayMs = Math.max(0, (100 - offenseData.stats.quickness) * 10);
          }

          onBallPlayer.setAIMovement(newDirection, moveSpeed, offenseDelayMs);
          this.setDefenderReaction(onBallPlayer, onBallDefender, newDirection, moveSpeed, true);
        }
      }
    }
  }

  /**
   * ドリブル突破可能かどうかをチェック
   * @returns 突破可能な場合はtrue
   */
  public canPerformDribbleBreakthrough(): boolean {
    // オンボールプレイヤーを探す
    const allCharacters = [...this.allyCharacters, ...this.enemyCharacters];
    for (const char of allCharacters) {
      if (char.getState() === "ON_BALL_PLAYER") {
        // ボール位置が0番面（正面）で、まだ突破中でないかチェック
        return char.getCurrentBallFace() === 0 && !char.isInDribbleBreakthrough();
      }
    }
    return false;
  }

  /**
   * 破棄
   */
  public dispose(): void {
    if (this.inputController) {
      this.inputController.dispose();
    }
    if (this.jointController) {
      this.jointController.dispose();
    }
    if (this.collisionHandler) {
      this.collisionHandler.dispose();
    }
    this.ball.dispose();

    // 全AIコントローラーを破棄
    for (const ai of this.characterAIs) {
      ai.dispose();
    }

    // 全キャラクターを破棄
    for (const character of this.allyCharacters) {
      character.dispose();
    }
    for (const character of this.enemyCharacters) {
      character.dispose();
    }

    this.field.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }
}
