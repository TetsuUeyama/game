export type AnswerEntry = {
  page: number;
  answer: 'A' | 'B' | 'C' | 'D';
};

// 設定オブジェクト（スコアマップやページ範囲など）
const scoreSettings = [
  { pages: [1, 2, 3, 4, 5, 6, 7, 11, 12, 13, 15,], scoreMap: { A: 4, B: 3, C: 2, D: 1 } },
  { pages: [8, 9, 10, 14, 16, 17], scoreMap: { A: 1, B: 2, C: 3, D: 4 } },
  { pages: [18, 19, 20], scoreMap: { A: 4, B: 3, C: 2, D: 1 } },
  { pages: [21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35], scoreMap: { A: 1, B: 2, C: 3, D: 4 } },
  { pages: [36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46], scoreMap: { A: 1, B: 2, C: 3, D: 4 } },
  { pages: [47, 50, 53], scoreMap: { A: 1, B: 2, C: 3, D: 4 } },
  { pages: [48, 51, 54], scoreMap: { A: 1, B: 2, C: 3, D: 4 } },
  { pages: [49, 52, 55], scoreMap: { A: 1, B: 2, C: 3, D: 4 } }
];

const calculateScore = (answers: AnswerEntry[], settings: typeof scoreSettings[number]): number => {
  return answers
    .filter((a) => settings.pages.includes(a.page))
    .reduce((total, a) => total + settings.scoreMap[a.answer], 0);
};

export const psychogenicMentalReaction = (answers: AnswerEntry[]): number => {
  const firstPart = calculateScore(answers, scoreSettings[2]); // 18-20ページ範囲
  const secondPart = calculateScore(answers, scoreSettings[3]); // 21-35ページ範囲
  return ((firstPart + secondPart) / 72) * 100;
};

export const psychogenicPhysicalReaction = (answers: AnswerEntry[]): number => {
  return (calculateScore(answers, scoreSettings[4]) / 44) * 100;
};

// パートごとのスコア計算
export const calculatePartsScore = (answers: AnswerEntry[], part: number): number => {
  return calculateScore(answers, scoreSettings[part]);
};

export const supportScore = (
  answers: AnswerEntry[],
  targetPages: number[]
): { score: number; label: string } => {
  const weightMap = { A: 1, B: 2, C: 3, D: 4 };

  // 15点から各回答の点数を引く
  const totalDeduction = targetPages.reduce((sum, page) => {
    const filtered = answers.filter(a => a.page === page);
    return sum + filtered.reduce((subSum, a) => subSum + weightMap[a.answer], 0);
  }, 0);

  const score = 15 - totalDeduction;

  let label = "";
  if (score === 12) {
    label = "多い";
  } else if (score === 11 || score === 10) {
    label = "やや多い";
  } else if (score === 9 || score === 8) {
    label = "普通";
  } else if (score === 7 || score === 6) {
    label = "やや少ない";
  } else if (score <= 5) {
    label = "少ない";
  }

  return { score, label };
};

const processAnswers = (answers: AnswerEntry[]) => {
  return answers.map((a) => ({
    ...a,
    answer: a.answer as "A" | "B" | "C" | "D",
  }));
};

export const calculateScores = (answers: AnswerEntry[]) => {
  const processedAnswers = processAnswers(answers);

  // Apart Scores (part 0 and part 1)
  const ApartScore = calculatePartsScore(processedAnswers, 0) + calculatePartsScore(processedAnswers, 1);

  // Bpart Scores (part 2 and part 3)
  const BpartScore = calculatePartsScore(processedAnswers, 2) + calculatePartsScore(processedAnswers, 3) + calculatePartsScore(processedAnswers, 4);

  // Cpart Score (part 4)
  const CpartScore = calculatePartsScore(processedAnswers, 5) + calculatePartsScore(processedAnswers, 6) + calculatePartsScore(processedAnswers, 7);

  // Mental and Physical Scores
  const mentalScore = psychogenicMentalReaction(processedAnswers);
  const physicalScore = psychogenicPhysicalReaction(processedAnswers);

  const supportBoss = supportScore(processedAnswers, [47, 50, 53]);
  const supportColleague = supportScore(processedAnswers, [48, 51, 54]);
  const supportFamily = supportScore(processedAnswers, [49, 52, 55]);


  return {
    ApartScore,
    BpartScore,
    CpartScore,
    mentalScore,
    physicalScore,
    supportBoss,
    supportColleague,
    supportFamily,
  };
};