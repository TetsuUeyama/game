"use client";

import { useState } from "react";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs } from "firebase/firestore";

export default function FirebaseTestPage() {
  const [status, setStatus] = useState<string>("未テスト");
  const [loading, setLoading] = useState(false);

  const runTest = async () => {
    setLoading(true);
    setStatus("テスト中...");

    try {
      // 1. テストデータを書き込み
      const testData = {
        message: "接続テスト成功",
        timestamp: new Date().toISOString(),
      };
      const docRef = await addDoc(collection(db, "connection-test"), testData);

      // 2. データを読み取り
      const snapshot = await getDocs(collection(db, "connection-test"));
      const count = snapshot.size;

      setStatus(
        `成功! ドキュメントID: ${docRef.id} / コレクション内のドキュメント数: ${count}`
      );
    } catch (error) {
      setStatus(`エラー: ${error instanceof Error ? error.message : error}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 40, fontFamily: "sans-serif" }}>
      <h1>Firebase 接続テスト</h1>
      <button
        onClick={runTest}
        disabled={loading}
        style={{
          marginTop: 16,
          padding: "10px 24px",
          fontSize: 16,
          cursor: loading ? "not-allowed" : "pointer",
        }}
      >
        {loading ? "テスト中..." : "テスト実行"}
      </button>
      <p style={{ marginTop: 16 }}>
        ステータス: <strong>{status}</strong>
      </p>
    </div>
  );
}
