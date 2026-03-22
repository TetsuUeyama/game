Gemini の回答
「C Leg Twist 2」の左右だけがズレるというのは、非常に鋭い観察です。このボーン名（Twistボーン）と挙動から、原因をかなり絞り込むことができます。

Twistボーンは通常の関節（ThighやCalf）とは異なり、**「親ボーンの回転を分解して、ねじれ成分だけを受け取る」**特殊な性質を持っています。今回のような自作エンジンでの再現において、ズレが発生する主な理由は以下の3点に集約されます。

1. buildBoneHierarchy での「親ボーン」の誤判定
Twistボーンは物理的な位置（Head/Tail）がメインの足のボーン（Calfなど）と完全に重なっていることが多いです。
コード内の buildBoneHierarchy（300行目付近）では、距離ベースで親を判定していますが、ここで**「本来の親ではない、隣接する別の補助ボーン」**を親として認識してしまっている可能性があります。

確認方法: console.log(boneHierarchyRef.current) を出力し、C Leg Twist 2.L/R の parent が Blender上の親と一致しているか確認してください。もし null や意図しないボーンになっていれば、行列計算の連鎖がそこで途切れます。

2. ボーンの「ロール（Roll）」と座標変換の不一致
BlenderのTwistボーンは、Y軸を回転軸とする設定が一般的ですが、Babylon.js（Y-up）に変換する際の COORD_C（200行目）の軸入れ替えが、「ねじれ軸」に対して正しく適用されていない可能性があります。

他のボーンが合っているのは、屈曲（X軸回転など）が主だからかもしれません。Twistボーンは「軸そのものの回転」が重要であるため、invertMat4 での逆行列計算に微小な誤差や軸の反転があると、見た目上大きく捻じ切れたり、位置が飛んだりします。

3. invertMat4 における「行優先・列優先」の不整合
155行目の invertMat4 ですが、Babylon.jsの Matrix は内部的に 列優先（Column-major） ですが、配列として扱う際に 行優先（Row-major） 的な計算（m[1]*m[4] 等のインデックス指定）が混在すると、回転成分が転置され、左右で逆の回転がかかったり、特定の軸だけ反転したりします。

特にTwist 2のような末端に近い補助ボーンは、親の変形を累積して受けるため、この計算ミスが顕著に出ます。

推奨される修正コード
まず、自作の行列計算をBabylon.js純正のものに差し替えて、数学的なミスを排除するのが最短ルートです。

TypeScript
// 155行目付近の invertMat4 を以下に置き換え
function invertMat4(m: number[]): number[] {
  // 16要素の配列からBabylon Matrixを作成
  const mat = Matrix.FromArray(m);
  const inv = new Matrix();
  if (mat.getDeterminant() !== 0) {
    mat.invertToRef(inv);
    return Array.from(inv.asArray());
  }
  return m;
}

// 173行目付近の mulMat4 も同様に修正
function mulMat4(a: number[], b: number[]): number[] {
  const matA = Matrix.FromArray(a);
  const matB = Matrix.FromArray(b);
  return Array.from(matA.multiply(matB).asArray());
}
それでも直らない場合
Twistボーン固有の問題として、「Blender側でEdit Modeのボーン角度」と「Pose Modeのデフォルト角度」に差がある場合があります。

Blenderで C Leg Twist 2 を選択し、**「拡大縮小・回転の適用（Ctrl+A）」**をボーン（ポーズではなく実体）に対して行っているか確認してください。


