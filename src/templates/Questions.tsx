"use client";
import { Box, Flex } from "@chakra-ui/react";
import { Text } from "@/components/Text";
import { Button } from "@/components/ui/button";
import { ContentProgress } from "@/components/ContentProgress";
import { QuestionData } from "@/utils/QuestionData";
import { colors } from "@/utils/theme";

type Props = {
  StepUpdate: (Step: number) => void;
  PageUpdate: (Page: number) => void;
  Page: number;
  QuestionAnswer: (Page: number, Answer: string) => void;
  toExplanation: () => void;
  isSending?: boolean;
};

export const Questions = ({
  StepUpdate,
  PageUpdate,
  QuestionAnswer,
  Page,
  toExplanation,
  isSending
}: Props) => {
  const Update = (Page: number) => {
    PageUpdate(Page + 1);
  };

  const UpdateReturn = (Page: number) => {
    PageUpdate(Page - 1);

    if (Page === 0) {
      PageUpdate(Page);
      StepUpdate(0);
    }
  };

  const currentQuestion = QuestionData.find((q) => q.TotalPage === Page);

  const completedCount = (Page: number) => {
    if (Page <= 17) {
      return currentQuestion?.QuestionPage ?? 0;
    } else if (Page >= 19 && Page <= 47) {
      return currentQuestion ? currentQuestion.QuestionPage - 17 : 0;
    } else if (Page >= 48 && Page <= 57) {
      return currentQuestion ? currentQuestion.QuestionPage - 46 : 0;
    } else {
      return currentQuestion ? currentQuestion.QuestionPage - 55 : 0;
    }
  };
  const totalCount = (Page: number) => {
    if (Page <= 17) {
      return 17;
    } else if (Page >= 19 && Page <= 47) {
      return 29;
    } else if (Page >= 48 && Page <= 57) {
      return 9;
    } else {
      return 2;
    }
  };

  const progressValue = (completedCount(Page) / totalCount(Page)) * 100;

  type ButtonOptions = {
    A: (Page: number) => string;
    B: (Page: number) => string;
    C: (Page: number) => string;
    D: (Page: number) => string;
  };

  const ButtonAnswer: ButtonOptions = {
    A: (Page: number) => {
      if (Page <= 17) return "そうだ";
      else if (Page >= 18 && Page <= 47) return "ほとんどなかった";
      else if (Page >= 48 && Page <= 57) return "非常に";
      else if (Page >= 59 && Page <= 60) return "満足";
      return "";
    },
    B: (Page: number) => {
      if (Page <= 17) return "まあそうだ";
      else if (Page >= 18 && Page <= 47) return "ときどきあった";
      else if (Page >= 48 && Page <= 57) return "かなり";
      else if (Page >= 59 && Page <= 60) return "まあ満足";
      return "";
    },
    C: (Page: number) => {
      if (Page <= 17) return "ややちがう";
      else if (Page >= 18 && Page <= 47) return "しばしばあった";
      else if (Page >= 48 && Page <= 57) return "多少";
      else if (Page >= 59 && Page <= 60) return "やや不満足";
      return "";
    },
    D: (Page: number) => {
      if (Page <= 17) return "ちがう";
      else if (Page >= 18 && Page <= 47) return "ほとんどいつもあった";
      else if (Page >= 48 && Page <= 57) return "全くない";
      else if (Page >= 59 && Page <= 60) return "不満足";
      return "";
    },
  };

  const descriptionText = (Page: number) => {
    if (Page === 0) {
      return (
        <>
          <Text fontSize={16} text={"あなたの仕事についてうかがいます。"} />
          <Text
            fontSize={16}
            text={"4つの中から最もあてはまるものを選んでください。（全17問）"}
          />
        </>
      );
    } else if (Page === 18) {
      return (
        <>
          <Text
            fontSize={16}
            text={"最近 1 か月間のあなたの状態についてうかがいます。"}
          />
          <Text
            fontSize={16}
            text={"最もあてはまるものを選んでください。（全29問）"}
          />
        </>
      );
    } else if (Page === 48) {
      return (
        <>
          <Text
            fontSize={16}
            text={"あなたの周りの方々についてうかがいます。"}
          />
          <Text
            fontSize={16}
            text={"最もあてはまるものを選んでください。（全9問）"}
          />
        </>
      );
    } else if (Page === 58) {
      return <Text fontSize={16} text={"満足度について（全2問）"} />;
    }
  };

  const AnswerAtoD = (Answer: string) => {
    if (currentQuestion?.QuestionPage !== undefined) {
      QuestionAnswer(currentQuestion.QuestionPage, Answer);
    }
  };

  return (
    <Box
      textAlign={"center"}
      alignItems={"center"}
      position={"relative"}
      maxWidth={"483px"}
      margin={"auto"}
    >
      {[0, 18, 48, 58, 61].includes(Page) ? (
        <Box>
          <Box
            color={colors.text}
            fontWeight={"bold"}
            textAlign={"left"}
            pt={5}
            width={"80%"}
            margin={"auto"}
          >
            <Text fontSize={20} text={currentQuestion?.QuestionStep ?? ""} />
            <Text fontSize={20} text={currentQuestion?.QuestionTitle ?? ""} />
          </Box>
          <Box
            color={colors.text}
            fontWeight={"normal"}
            textAlign={"left"}
            pt={5}
            width={"80%"}
            margin={"auto"}
          >
            {descriptionText(Page)}
          </Box>
          <Flex width={"90%"} gap={2} margin={"auto"} mt={10}>
            <Button
              onClick={() => {
                if (Page === 61) {
                  toExplanation();

                } else {
                  Update(Page);
                }
              }}
              color={colors.base}
              bg={colors.ButtonStart}
              width={"100%"}
              disabled={isSending}
            >
              {Page === 61 ? "結果を見る" : "次へ"}
            </Button>
          </Flex>
        </Box>
      ) : (
        <>
          <Box pt={5} width={"80%"} textAlign={"left"} margin={"auto"}>
            {currentQuestion && (
              <>
                <Text
                  fontSize={20}
                  fontWeight="bold"
                  text={currentQuestion.QuestionStep}
                />
                <Text
                  fontSize={20}
                  fontWeight="bold"
                  text={currentQuestion.QuestionTitle}
                />
              </>
            )}
          </Box>
          <Box>
            <ContentProgress
              value={progressValue}
              size={"md"}
              colorScheme={colors.brand}
            />
          </Box>
          <Box pt={5} width={"80%"} textAlign={"left"} margin={"auto"}>
            {currentQuestion && (
              <Text
                fontSize={16}
                fontWeight="bold"
                text={currentQuestion.QuestionText}
              />
            )}
          </Box>
          <Box
            width="90%"
            margin="auto"
            mt={5}
            display="flex"
            flexDirection="column"
            gap={2}
          >
            <Button
              onClick={() => {
                Update(Page);
                AnswerAtoD("A");
              }}
              _hover={{ opacity: 0.5 }}
              color={colors.base}
              bg={colors.ButtonOne}
              width="100%"
            >
              {ButtonAnswer.A(Page)}
            </Button>
            <Button
              onClick={() => {
                Update(Page);
                AnswerAtoD("B");
              }}
              _hover={{ opacity: 0.5 }}
              color={colors.base}
              bg={colors.ButtonTwo}
              width="100%"
            >
              {ButtonAnswer.B(Page)}
            </Button>
            <Button
              onClick={() => {
                Update(Page);
                AnswerAtoD("C");
              }}
              _hover={{ opacity: 0.5 }}
              color={colors.base}
              bg={colors.ButtonThree}
              width="100%"
            >
              {ButtonAnswer.C(Page)}
            </Button>
            <Button
              onClick={() => {
                Update(Page);
                AnswerAtoD("D");
              }}
              _hover={{ opacity: 0.5 }}
              color={colors.base}
              bg={colors.ButtonFour}
              width="100%"
            >
              {ButtonAnswer.D(Page)}
            </Button>
          </Box>
        </>
      )}
      <Box pt={10} margin={"auto"} width={"90%"} textAlign={"left"}>
        <Button
          onClick={() => UpdateReturn(Page)}
          _hover={{ opacity: 0.5 }}
          color={colors.base}
          width={"30%"}
          bg={colors.brand}
          variant={"plain"}
          disabled={isSending}
        >
          戻る
        </Button>
      </Box>
    </Box>
  );
};
