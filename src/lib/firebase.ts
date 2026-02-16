// =============================================================
// Firebase 初期化・設定ファイル
// =============================================================
//
// このファイルはアプリ全体で1つだけ存在するFirebaseの初期化ファイルです。
// Firebaseアプリの初期化と、Firestoreデータベースのインスタンスを
// エクスポートします。
//
// 使い方（他のファイルからインポート）:
//   import { db } from '@/lib/firebase';
//
// Firestoreの基本操作の例:
//   import { collection, getDocs, addDoc } from 'firebase/firestore';
//   import { db } from '@/lib/firebase';
//
//   // データ取得
//   const snapshot = await getDocs(collection(db, 'コレクション名'));
//
//   // データ追加
//   await addDoc(collection(db, 'コレクション名'), { key: 'value' });
// =============================================================

import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// -------------------------------------------------------------
// Firebase設定オブジェクト
// -------------------------------------------------------------
// .env.local に設定された環境変数から読み込みます。
// process.env.NEXT_PUBLIC_xxx は Next.js のビルド時に
// 実際の値に置き換えられます。
// -------------------------------------------------------------
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// -------------------------------------------------------------
// Firebaseアプリの初期化
// -------------------------------------------------------------
// getApps() で既に初期化済みかチェックします。
//
// なぜこのチェックが必要か？
//   Next.jsの開発モード（Hot Module Replacement）では、
//   ファイルが変更されるたびにモジュールが再読み込みされます。
//   initializeApp() を2回呼ぶとエラーになるため、
//   「まだ初期化されていない場合のみ初期化する」という
//   ガード処理が必要です。
//
// getApps().length === 0 の場合:
//   → まだ初期化されていない → initializeApp() を実行
// getApps().length > 0 の場合:
//   → 既に初期化済み → getApps()[0] で既存のインスタンスを再利用
// -------------------------------------------------------------
const app =
  getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// -------------------------------------------------------------
// Firestore データベースインスタンス
// -------------------------------------------------------------
// getFirestore(app) で、上で初期化したFirebaseアプリに
// 紐づくFirestoreインスタンスを取得します。
//
// この `db` を他のファイルからインポートして使います。
// Firestoreは NoSQL ドキュメントデータベースで、
// データは「コレクション」→「ドキュメント」の階層構造です。
//
// 例: users コレクションに新しいドキュメントを追加
//   import { collection, addDoc } from 'firebase/firestore';
//   await addDoc(collection(db, 'users'), { name: '太郎', age: 25 });
// -------------------------------------------------------------
const db = getFirestore(app);

// app: Firebase認証やStorageなど、他のサービスを追加する際に使用
// db:  Firestoreデータベースへの読み書きに使用
export { app, db };
