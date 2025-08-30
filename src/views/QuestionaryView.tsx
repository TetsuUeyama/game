"use client";
import { Questions } from "@/templates/Questions";
import { InputUserData } from "@/templates/InputUserData";
import { Box } from "@chakra-ui/react";
import { useState } from "react";
import { Header } from "@/templates/Header";
import { AnswerEntry, UserEntry } from "@/models/Models";
import { _setUser } from "@/api/User";
import { _setAnswer } from "@/api/Answer";
import { colors } from "@/utils/theme";

export const QuestionaryView = () => {
  const [STEP, setSTEP] = useState<number>(0);
  const [Page, setPage] = useState<number>(0);
  const [userInformation, setUserInformation] = useState<UserEntry>({
    UserLastName: "",
    UserFirstName: "",
    UserAddress: "",
    UserGender: "",
  });
  const [answers, setAnswers] = useState<AnswerEntry[]>([]);
  const [isSending, setIsSending] = useState(false);

  const StepUpdate = (step: number) => {
    setSTEP(step);
  };

  const PageUpdate = (page: number) => {
    setPage(page);
  };

  const QuestionAnswer = (Page: number, Answer: string) => {
    setAnswers((prevAnswers) => {
      const index = prevAnswers.findIndex((entry) => entry.page === Page);

      if (index !== -1) {
        // 既存のPageがある場合は上書き
        const updated = [...prevAnswers];
        updated[index] = { page: Page, answer: Answer };
        return updated;
      } else {
        // なければ追加
        return [...prevAnswers, { page: Page, answer: Answer }];
      }
    });

  };

  const saveDataToFile = async (currentAnswers: AnswerEntry[], currentUserInformation: UserEntry) => {

    const generateRandomId = () =>
      Math.floor(10000000 + Math.random() * 90000000).toString();
    const UserId = generateRandomId();

    const generateRandomId3 = (length = 20) => {
      const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let result = '';
      for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return result;
    };
    
    const dataIdAnswer = generateRandomId3();

  
    const userInformationSuccess = await _setUser({
      id: UserId,
      data: {
        UserId: UserId,
        userInformation: [currentUserInformation],
      },
    });
  
    if (!userInformationSuccess) {
      console.error("userInformationの保存に失敗しました。");
      return;
    }
  
    const answersSuccess = await _setAnswer({
      id: dataIdAnswer,
      data: {
        dataId: UserId,
        answers: currentAnswers,
      },
    });
  
    if (!answersSuccess) {
      
      return;
    }   
  };

  const toExplanation = async () => {
    if (isSending) return;
    setIsSending(true);
  
    const sendTime = new Date().toISOString();
    const currentAnswers = [...answers];
    const currentUserInformation = { ...userInformation };
  
    const newWindow = window.open("/loading", "_blank");
    if (!newWindow) {
      alert("ポップアップがブロックされました。設定をご確認ください。");
      setIsSending(false);
      return;
    }
  
    await saveDataToFile(currentAnswers, currentUserInformation);
  
    localStorage.setItem("userInformation", JSON.stringify(currentUserInformation));
    localStorage.setItem("answers", JSON.stringify(currentAnswers));
    localStorage.setItem("sendTime", sendTime);
  
  };

  const renderCheck = (STEP: number) => {
    switch (STEP) {
      case 0:
        return (
          <InputUserData
            StepUpdate={StepUpdate}
            userInfo={userInformation}
            setUserInfo={setUserInformation}
          />
        );
      case 1:
        return (
          <Questions
            Page={Page}
            StepUpdate={StepUpdate}
            PageUpdate={PageUpdate}
            QuestionAnswer={QuestionAnswer}
            toExplanation={toExplanation}
            isSending={isSending}
          />
        );
      default:
        return null;
    }
  };

  return (
    <Box
      color={colors.text}
      width={"100%"}
      height={"100%"}
      margin={"auto"}
      bg={colors.base}
    >
      <Header />
      {renderCheck(STEP)}
    </Box>
  );
};
