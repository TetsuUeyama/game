"use client";
import { Box, Flex } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { AnswerEntry, UserEntry } from "@/models/Models";
import { Text } from "@/components/Text";
import { Image } from "@/components/Image";
import { ComparisonGraph } from "@/components/ComparisonGraph";
import { ScoreBox } from "@/components/ScoreBox";
import { AdminHeader } from "@/templates/AdminHeader";
import { useParams } from "next/navigation";
import { calculateScores } from "@/utils/scoreCalculator";
import { _getUser } from "@/api/User";
import { _getAnswerByDataId } from "@/api/Answer";
import { colors } from "@/utils/theme";

export default function Explanation() {
  const { id } = useParams();

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      const result = await _getUser({ id: id.toString() });
      if (result) {
        const userInfo =
          Array.isArray(result.userInformation) &&
          result.userInformation.length > 0
            ? result.userInformation[0]
            : {
                UserLastName: "",
                UserFirstName: "",
                UserAddress: "",
                UserGender: "",
              };
        const timestamp = result.timestamp as number;

        setUserInformation({
          UserLastName: userInfo.UserLastName || "",
          UserFirstName: userInfo.UserFirstName || "",
          UserAddress: userInfo.UserAddress || "",
          UserGender: userInfo.UserGender || "",
        });

        setTimestamp(timestamp || 0);


        const answersResult = await _getAnswerByDataId(result.UserId);
        
        if (answersResult) {
          setAnswers(answersResult.answers); // Answersデータをセット
          
        } else {
          console.error("ユーザーデータの取得に失敗しました");
        }
      } else {
        console.error("ユーザーデータの取得に失敗しました");
      }
    };
    fetchData();
  }, [id]);

  const [userInformation, setUserInformation] = useState<UserEntry>({
    UserLastName: "",
    UserFirstName: "",
    UserAddress: "",
    UserGender: "",
  });
  const [answers, setAnswers] = useState<AnswerEntry[]>([]);
  const [timestamp, setTimestamp] = useState<number>(0);

  const scores = answers.length > 0
  ? calculateScores(answers.map((a) => ({ ...a, answer: a.answer as "A" | "B" | "C" | "D" })))
  : {
      ApartScore: 0,
      BpartScore: 0,
      CpartScore: 0,
      mentalScore: 0,
      physicalScore: 0,
      supportBoss: { score: 0, label: "" },
      supportColleague: { score: 0, label: "" },
      supportFamily: { score: 0, label: "" },
    };

  const [isHighScorer, setIsHighScorer] = useState<boolean>(false);
  useEffect(() => {
    if (answers.length > 0) {
      const apart = scores.ApartScore;
      const bpart = scores.BpartScore;
      const cpart = scores.CpartScore;

      if (bpart >= 77 || (apart + cpart >= 76 && bpart >= 63)) {
        setIsHighScorer(true);
      } else {
        setIsHighScorer(false);
      }
    }
  }, [answers]);

  const formatDate = (timestamp: Date | number | null | undefined): string => {
    if (!timestamp) return "不明";

    let millis: number;

    if (timestamp instanceof Date) {
      // Date オブジェクトの場合
      millis = timestamp.getTime();
    } else if (typeof timestamp === "number") {
      millis = timestamp < 1e12 ? timestamp * 1000 : timestamp;
    } else {
      return "不明";
    }

    const date = new Date(millis);
    if (isNaN(date.getTime())) return "不明";

    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const min = String(date.getMinutes()).padStart(2, "0");

    return `${yyyy}/${mm}/${dd} ${hh}:${min}`;
  };

  const formatSendDate = (timestamp?: Date | number | null): string => {
    if (!timestamp) return "不明";

    let millis: number;

    if (timestamp instanceof Date) {
      millis = timestamp.getTime();
    } else if (typeof timestamp === "number") {
      millis = timestamp < 1e12 ? timestamp * 1000 : timestamp;
    } else {
      return "不明";
    }

    const date = new Date(millis);
    if (isNaN(date.getTime())) return "不明";

    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}月${day}日`;
  };

  return (
    <Box
      color={colors.text}
      width={"100%"}
      margin={"auto"}
      bg={colors.GRAY100}
      pb={10}
    >
      <AdminHeader />
      <Box maxWidth={"483px"} margin={"auto"}>
        <Box margin={"auto"} width={"92%"} pt={5}>
          <Box>
            <Text fontWeight="bold" fontSize={16} text={"実施詳細"} />
          </Box>

          <Flex justifyContent="left" alignItems="center" width="100%" mt={5}>
            <Text
              fontWeight="bold"
              fontSize={16}
              text={userInformation.UserLastName || "未設定"}
            />
            <Text
              fontWeight="bold"
              fontSize={16}
              text={userInformation.UserFirstName || "未設定"}
            />{" "}
            /
            {userInformation.UserGender === "male" ? (
              <Text fontWeight="bold" fontSize={16} text={"男性"} />
            ) : (
              <Text fontWeight="bold" fontSize={16} text={"女性"} />
            )}
          </Flex>
          <Box width="65%" textAlign="left">
            <Text
              fontWeight="bold"
              fontSize={14}
              text={userInformation.UserAddress || "メールなし"}
            />
            <Text
              fontWeight="bold"
              fontSize={14}
              text={`実施日：${formatDate(timestamp)}`}
            />
          </Box>
        </Box>
        <Box
          transform="scale(0.9)"
          margin={"auto"}
          textAlign={"left"}
          alignItems={"center"}
          position={"relative"}
          color={colors.text}
          bg={colors.base}
          py={2}
        >
          <Box textAlign={"center"} alignItems={"center"} position={"relative"}>
            <Text
              fontSize={20}
              fontWeight="bold"
              text={"ストレスチェック結果"}
            />
          </Box>
          <Box
            width={"92%"}
            border={"1px solid red"}
            p={2}
            margin={"auto"}
            mt={5}
          >
            <Box>
              <Text
                fontWeight="bold"
                fontSize={14}
                text={
                  timestamp
                    ? `${formatSendDate(
                        timestamp
                      )}に施行したストレスチェックの結果、`
                    : "ストレスチェックの結果、"
                }
              />

              {isHighScorer && (
                <Box>
                  <Text
                    as="span"
                    fontWeight="bold"
                    fontSize={14}
                    text={"あなたは"}
                  />
                  <Text
                    as="span"
                    textDecoration="underline"
                    color={colors.RED400}
                    fontWeight="Bold"
                    fontSize={14}
                    text={"「高ストレス状態」"}
                  />
                  <Text
                    as="span"
                    fontWeight="bold"
                    fontSize={14}
                    text={"でした。"}
                  />
                </Box>
              )}
              {!isHighScorer && (
                <Box>
                  <Text
                    as="span"
                    fontWeight="bold"
                    fontSize={14}
                    text={"あなたは"}
                  />
                  <Text
                    as="span"
                    textDecoration="underline"
                    color={colors.RED400}
                    fontWeight="Bold"
                    fontSize={14}
                    text={"「中等度ストレス状態」"}
                  />
                  <Text
                    as="span"
                    fontWeight="bold"
                    fontSize={14}
                    text={"でした。"}
                  />
                </Box>
              )}

              <Text
                fontWeight="bold"
                fontSize={14}
                text={"ストレスチェックは、ご自身のストレス状態を"}
              />
              <Text
                fontWeight="bold"
                fontSize={14}
                text={"確認して頂く目的で実施しています。"}
              />
              <Text
                fontWeight="bold"
                fontSize={14}
                text={"この結果を、セルフケアにお役立てくださいませ。"}
              />
            </Box>

            {isHighScorer && (
              <Box mt={8}>
                <Text
                  fontWeight="bold"
                  fontSize={14}
                  text={"また、ストレス対策として、"}
                />
                <Text
                  fontWeight="bold"
                  fontSize={14}
                  text={
                    "無料でオンライン産業医面談を受けていただくことができます。"
                  }
                />
                <Text
                  fontWeight="bold"
                  fontSize={14}
                  text={"産業医には主義義務があるため、"}
                />
                <Text
                  fontWeight="bold"
                  fontSize={14}
                  text={"面談内容が上司や同僚に伝わることはありません。"}
                />
                <Text
                  fontWeight="bold"
                  fontSize={14}
                  text={"ご希望の方は、下記QRコードから産業医面談の"}
                />
                <Text
                  fontWeight="bold"
                  fontSize={14}
                  text={"ご予約をお取りください。"}
                />
              </Box>
            )}
          </Box>

          <Box
            textAlign={"center"}
            alignItems={"center"}
            position={"relative"}
            pt={5}
          >
            <Text
              fontSize={16}
              fontWeight="bold"
              text={"【ストレスによる心身の反応】"}
            />
          </Box>

          <Box width={"92%"} margin={"auto"} mt={2}>
            <ComparisonGraph
              overflow={""}
              title={"ストレスによる心の反応"}
              TextHidden={true}
              score={scores.mentalScore}
            />
            <ComparisonGraph
              overflow={""}
              title={"ストレスによる体の反応"}
              TextHidden={false}
              score={scores.physicalScore}
            />
          </Box>
          <Flex
            mt={8}
            justifyContent={"center"}
            alignItems={"center"}
            width={"70%"}
          >
            <Flex
              justifyContent={"center"}
              alignItems={"center"}
              width={"40%"}
              height={2}
            >
              <Box
                rounded={"sm"}
                mr={1}
                width={3}
                height={3}
                bg={colors.GRAY600}
              ></Box>
              <Text fontWeight="bold" fontSize={14} text={"ご自身の数値"} />
            </Flex>
            <Box width={"65%"} textAlign={"left"}>
              <Text
                fontWeight="bold"
                fontSize={{ base: 7, sm: 8, md: 8, lg: 8, xl: 8 }}
                text={"ストレスが高いほど、点数が高くなります"}
              />
              <Text
                fontWeight="bold"
                fontSize={{ base: 7, sm: 8, md: 8, lg: 8, xl: 8 }}
                text={"100点が最大のストレス値として算出しています。"}
              />
            </Box>
          </Flex>

          <Box
            textAlign={"center"}
            alignItems={"center"}
            position={"relative"}
            pt={5}
          >
            <Text
              fontSize={16}
              fontWeight="bold"
              text={"【ストレスに影響を与える因子】"}
            />
          </Box>

          <Flex
            justifyContent={"space-around"}
            alignItems={"center"}
            pt={5}
            width={"85%"}
            margin={"auto"}
          >
            <ScoreBox
              score={scores.supportBoss.score}
              textOne={"上司からのサポート"}
              textTwo={scores.supportBoss.label}
            />
            <ScoreBox
              score={scores.supportColleague.score}
              textOne={"同僚からのサポート"}
              textTwo={scores.supportColleague.label}
            />
            <ScoreBox
              score={scores.supportFamily.score}
              textOne={"家族・友人からのサポート"}
              textTwo={scores.supportFamily.label}
            />
          </Flex>

          <Box
            width={"92%"}
            border={"1px solid red"}
            p={2}
            margin={"auto"}
            mt={5}
          >
            <Box
              textAlign={"center"}
              alignItems={"center"}
              position={"relative"}
              py={2}
            >
              <Text
                fontSize={14}
                fontWeight="bold"
                text={"【産業医コメント】"}
              />
            </Box>

            <Box>
              <Box>
                <Text
                  fontWeight="bold"
                  fontSize={14}
                  text={"ストレスが体の症状に大きく影響しているようです"}
                />
                <Text
                  fontWeight="bold"
                  fontSize={14}
                  text={
                    "お休みできる時には、十分に睡眠を取ることをお試しください。"
                  }
                />
                <Text
                  fontWeight="bold"
                  fontSize={14}
                  text={"また、会社の皆様や家族・友人とすごすことも、"}
                />
                <Text
                  fontWeight="bold"
                  fontSize={14}
                  text={"ストレス軽減につながる可能性があります。"}
                />
              </Box>
              {isHighScorer && (
                <Flex
                  justifyContent={"space-around"}
                  alignItems={"center"}
                  mt={5}
                >
                  <Text
                    fontWeight="bold"
                    textDecoration="underline"
                    fontSize={12}
                    text={
                      "（オンライン産業医面談は、こちらからお申込み下さい。）"
                    }
                  />
                  <Image src={"/images/QRCode.png"} alt={"aaaaa"}></Image>
                </Flex>
              )}
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
