"use client";
import { Box, Button, Flex, Input, InputGroup, InputElement, Field } from "@chakra-ui/react";
import { Text } from "@/components/Text";
import { AdminHeader } from "@/templates/AdminHeader";
import { ButtonGroup, IconButton, Pagination } from "@chakra-ui/react"
import { LuChevronLeft, LuChevronRight } from "react-icons/lu"
import { useState, useEffect, useMemo } from "react";
import {  UserDataModal } from "@/models/Models";
import NextLink from "next/link";
import { _getUsers } from "@/api/User";
import { colors } from "@/utils/theme";
import "@/utils/styles.css";
import { Email, Password } from "@/utils/EmailPassword";

export default function Admin() {
  const [Users, setUsers] = useState<UserDataModal[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [value, setValue] = useState("");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [filteredLayouts, setFilteredLayouts] = useState<UserDataModal[]>([]); // フィルタリングされた layouts

  useEffect(() => {
    const fetchData = async () => {
      const data = await _getUsers();
      if (JSON.stringify(data) !== JSON.stringify(Users)) {
        setUsers(data || []);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    const filtered = Users.filter((user) => {
      const info = user.userInformation?.[0];
      if (!info) return false; // userInformationが無いなら除外
  
      const searchStr = `${info.UserLastName} ${info.UserFirstName} ${info.UserAddress}`.toLowerCase();
      return searchStr.includes(searchTerm.toLowerCase());
    });
  
    setFilteredLayouts(filtered);
  }, [Users, searchTerm]);

  const searchTags = () => {
    setSearchTerm(value);
    
  };
  
    const itemsPerPage = 7;

   // 表示する現在のアイテムを useMemo で計算
   const currentItems = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredLayouts.slice(startIndex, endIndex);
  }, [currentPage, itemsPerPage, filteredLayouts]);

type FirestoreTimestamp = {
  seconds: number;
  nanoseconds: number;
};

const formatDate = (timestamp: number | FirestoreTimestamp | null | undefined): string => {
  if (!timestamp) return "不明";

  let millis: number;

  if (typeof timestamp === "object" && "seconds" in timestamp && "nanoseconds" in timestamp) {

    millis = timestamp.seconds * 1000 + Math.floor(timestamp.nanoseconds / 1_000_000);
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

const [email, setEmail] = useState("");
const [password, setPassword] = useState("");
const [logIn, setLogIn] = useState(false);
const [loginError, setLoginError] = useState(false);
const [touched, setTouched] = useState({
  email: false,
});

  const emailRegex = /^[\w.%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
  const isEmailValid = emailRegex.test(email.trim());

  return (
    <Box 
      color={colors.text} 
      width={"100vw"} 
      bg={colors.base}
      pb={20} 
    >
      <AdminHeader 
        logIn={logIn} 
        setLogIn={setLogIn} 
        setPassword={setPassword} 
        setEmail={setEmail}
      />
      {!logIn ? (
        <Box
          width={"92%"}
          maxWidth={"483px"} 
          margin={"auto"}
        >
      <Box>
        <Box
          color={colors.text}
          fontWeight={"normal"}
          pt={5}
          textAlign={"left"}
          width={"90%"}
          margin={"auto"}
          mt={20}
        >
          <Text 
            color={colors.TextBlue} 
            fontWeight="bold" 
            fontSize={16} 
            text={"管理者ページ"} 
          />
        </Box>

        <Box
          width={"90%"}
          height={"100%"}
          textAlign={"left"}
          justifyContent={"space-between"}
          pb={20}
          margin={"auto"}
          mt={5}
        >

          <Flex 
            width={"318px"} 
            gap={2} 
            margin={"auto"} 
            mt={10}
          >
            <Field.Root>
              <Field.Label>メールアドレス</Field.Label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@example.com"
                onBlur={() =>
                  setTouched((prev) => ({ ...prev,email: true }))
                }
                bg={"#F1F1F1"}
                borderColor={
                  !isEmailValid && touched.email ? "red.300" : "gray.200"
                }
                fontSize={16}
                border={"none"}
              />
              {!isEmailValid && touched.email && (
                <Box color={colors.Red400} fontSize="sm" mt={1}>
                  メールアドレスの形式で入力してください
                </Box>
              )}
            </Field.Root>
          </Flex>
          <Flex 
            width={"318px"} 
            gap={2} 
            margin={"auto"} 
            mt={10}
          >
            <Field.Root>
              <Field.Label>パスワード</Field.Label>
              <Box 
                width={"100%"}
                mb={5}
                bg={"#F1F1F1"}
                py={1}
              >
              <Input
                width={"100%"} 
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                variant={"flushed"}
                px={2}
              />
            </Box>
            </Field.Root>
          </Flex>
          <Box>

          </Box>

          <Flex 
            width={"154px"} 
            gap={2} 
            margin={"auto"} 
            mt={5}
          >
            <Button
              onClick={() => {
                if (email === Email && password === Password) {
                  setLogIn(true);
                  setLoginError(false); // 成功時はリセット
                } else {
                  setLoginError(true); // エラーを表示
                }
              }}
              color={colors.base}
              bg={colors.ButtonThree}
              width={"100%"}
              _hover={{ opacity: 0.5 }}
            >
              始める
            </Button>
          </Flex>
              {loginError && (
                <Box textAlign={"center"} mt={2}>
                  <Text 
                    color={colors.Red400} 
                    fontSize="sm" 
                    text="メールアドレスまたはパスワードが違います" 
                  />
                </Box>
              )}
        </Box>
      </Box>
        </Box>
      ) : (
        <Box
          width={"92%"}
            maxWidth={"483px"} 
            margin={"auto"}
          >
            <Box 
              width={"90%"} 
              margin={"auto"} 
            >
            <Box 
              textAlign={"left"} 
              alignItems={"center"} 
              position={"relative"} 
              pt={5}
            >
              <Text 
                fontSize={16}
                color={colors.text}
                fontWeight="bold" 
                text={"実施者一覧"}
              />
            </Box>
              <Box>
              <Box fontSize={12} fontWeight={"normal"} >
                  <Flex mt={2}>
                    <InputGroup>
                      <>
                        <Input
                          type="text"
                          value={value}
                          onChange={(e) => setValue(e.target.value)}
                          border={"1px solid #E0E0E0"}
                        />
                        <InputElement>
                        </InputElement>
                      </>
                    </InputGroup>
                    <Box ml={2} width={"20%"}>
                      <Button
                        fontSize={14}
                        fontWeight={"normal"}
                        color={colors.base}
                        bg={colors.HeaderBlue}
                        onClick={() => searchTags()}
                      >
                        検索
                      </Button>
                    </Box>
                  </Flex>
                </Box>
              </Box>
            </Box>

            <Box>

            {currentItems
              .sort((a, b) => {
                return (b.timestamp || 0) - (a.timestamp || 0);
              })
              .map((Users, index) => (

                <Box 
                  key={Users.UserId || index} 
                  mt={4} 
                  shadow="sm" 
                  borderRadius={10} 
                  bg={colors.base} 
                  p={2}
                
                >
                  <NextLink href={`/Explanation/${Users.UserId}`} target="_blank" style={{ textDecoration: "none" }}>
                    <Flex justifyContent="left" alignItems="center" width="100%">
                      <Text fontWeight="bold" fontSize={16} text={Users.userInformation[0].UserLastName || "未設定"} />
                      <Text fontWeight="bold" fontSize={16} text={Users.userInformation[0].UserFirstName || "未設定"} /> / 
                      {Users.userInformation[0].UserGender === "male" ? (
                        <Text fontWeight="bold" fontSize={16} text={"男性"} />
                      ) : (
                        <Text fontWeight="bold" fontSize={16} text={"女性"} />
                      )}
                    </Flex>
                    <Box width="65%" textAlign="left">
                      <Text fontWeight="bold" fontSize={14} text={Users.userInformation[0].UserAddress || "メールなし"} />
                      <Text fontWeight="bold" fontSize={14}   text={`実施日：${Users.timestamp != null ? formatDate(Users.timestamp) : "不明"}`} 
                    />
                    </Box>
                  </NextLink>
                </Box>
              ))}

            </Box>
            <Flex
              width={"92%"}
              maxWidth={"483px"}
              margin={"auto"}
              mb={5} 
              justifyContent="center" 
              alignItems="center"
              position={"absolute"}
              bottom={0}
            >
              <Pagination.Root 
                count={filteredLayouts.length} 
                pageSize={itemsPerPage} 
                defaultPage={1}
              >
                <ButtonGroup variant="ghost" size="sm">
                  <Pagination.PrevTrigger asChild>
                    <IconButton 
                      onClick={() => setCurrentPage(currentPage - 1)}
                      bg={{ base: "ghost", _selected: "gray.400", _hover: "gray.400" }} 
                      color={{ base: colors.GRAY400, _selected: colors.base, _hover: colors.base }}
                    >
                      <LuChevronLeft />
                    </IconButton>
                  </Pagination.PrevTrigger>

                  <Pagination.Items
                    render={(page) => (
                      <IconButton 
                        variant={{ base: "ghost", _selected: "outline" }}
                        onClick={() => setCurrentPage(page.value)}
                        border={"1px solid #E0E0E0"}
                        bg={{ base: "ghost", _selected: colors.GRAY400, _hover: colors.GRAY400 }} 
                        color={{ base: colors.GRAY400, _selected: colors.base, _hover: colors.base }}
                      >
                        {page.value}
                      </IconButton>
                    )}
                  />

                  <Pagination.NextTrigger asChild>
                    <IconButton
                      onClick={() => setCurrentPage(currentPage + 1)}
                      bg={{ base: "ghost", _selected: colors.GRAY400, _hover: colors.GRAY400 }} 
                      color={{ base: colors.GRAY400, _selected: colors.base, _hover: colors.base }}
                    >
                      <LuChevronRight />
                    </IconButton>
                  </Pagination.NextTrigger>
                </ButtonGroup>
              </Pagination.Root>
            </Flex>
          </Box>      
      )}    

    </Box>
  );
}


