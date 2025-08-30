"use client";
import { useState } from "react";
import { UserEntry } from "@/models/Models";

type Props = {
  StepUpdate: (Step: number) => void;
  userInfo: UserEntry;
  setUserInfo: React.Dispatch<React.SetStateAction<UserEntry>>;
};

export const InputUserData = ({ StepUpdate, userInfo, setUserInfo }: Props) => {
  const [touched, setTouched] = useState({
    lastName: false,
    firstName: false,
    address: false,
  });

  const nameRegex =
    /^[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}ー\s]+$/u;
  const emailRegex = /^[\w.%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

  const isLastNameValid = nameRegex.test(userInfo.UserLastName.trim());
  const isFirstNameValid = nameRegex.test(userInfo.UserFirstName.trim());
  const isEmailValid = emailRegex.test(userInfo.UserAddress.trim());
  const isGenderValid =
    userInfo.UserGender === "male" || userInfo.UserGender === "female";

  const isFormComplete =
    isLastNameValid && isFirstNameValid && isEmailValid && isGenderValid;

  return (
    <div className="text-center mt-2 max-w-[483px] mx-auto relative">
      <div className="text-left pt-5 w-[90%] mx-auto text-gray-800">
        <p className="text-base">4つのSTEPによる簡単な質問から、</p>
        <p className="text-base">あなたの職場におけるストレスレベルを測定します。</p>
        <p className="text-base">質問は全部で57問です。</p>
        <div className="text-right mt-2">
          <p className="text-base">（所要時間約5分間）</p>
        </div>
      </div>

      <div className="w-[90%] text-left pb-20 mx-auto mt-5">
        <div className="my-2">
          <p className="font-semibold">お名前</p>
        </div>
        <div className="flex gap-2">
          <input
            value={userInfo.UserLastName}
            onChange={(e) =>
              setUserInfo((prev) => ({ ...prev, UserLastName: e.target.value }))
            }
            placeholder="姓"
            onBlur={() => setTouched((prev) => ({ ...prev, lastName: true }))}
            className={`w-full p-2 border rounded-md text-base ${
              !isLastNameValid && touched.lastName ? "border-red-300" : "border-gray-300"
            }`}
          />
          <input
            value={userInfo.UserFirstName}
            onChange={(e) =>
              setUserInfo((prev) => ({ ...prev, UserFirstName: e.target.value }))
            }
            placeholder="名"
            onBlur={() => setTouched((prev) => ({ ...prev, firstName: true }))}
            className={`w-full p-2 border rounded-md text-base ${
              !isFirstNameValid && touched.firstName ? "border-red-300" : "border-gray-300"
            }`}
          />
        </div>
        {!isLastNameValid && touched.lastName && (
          <div className="text-red-500 text-sm mt-1">姓は漢字・ひらがな・カタカナで入力してください</div>
        )}
        {!isFirstNameValid && touched.firstName && (
          <div className="text-red-500 text-sm mt-1">名は漢字・ひらがな・カタカナで入力してください</div>
        )}

        <div className="mt-5">
          <label className="block mb-1 font-semibold">Email</label>
          <input
            value={userInfo.UserAddress}
            onChange={(e) =>
              setUserInfo((prev) => ({ ...prev, UserAddress: e.target.value }))
            }
            placeholder="example@example.com"
            onBlur={() => setTouched((prev) => ({ ...prev, address: true }))}
            className={`w-full p-2 border rounded-md text-base ${
              !isEmailValid && touched.address ? "border-red-300" : "border-gray-300"
            }`}
          />
          {!isEmailValid && touched.address && (
            <div className="text-red-500 text-sm mt-1">メールアドレスの形式で入力してください</div>
          )}
        </div>

        <div className="my-2 mt-6">
          <p className="font-semibold">性別</p>
        </div>
        <div className="flex justify-between gap-2">
          <button
            type="button"
            onClick={() => setUserInfo((prev) => ({ ...prev, UserGender: "male" }))}
            className={`w-1/2 py-2 rounded text-white ${
              userInfo.UserGender === "male" ? "bg-blue-600" : "bg-blue-400 opacity-50"
            } hover:opacity-100`}
          >
            男性
          </button>
          <button
            type="button"
            onClick={() => setUserInfo((prev) => ({ ...prev, UserGender: "female" }))}
            className={`w-1/2 py-2 rounded text-white ${
              userInfo.UserGender === "female" ? "bg-pink-600" : "bg-pink-400 opacity-50"
            } hover:opacity-100`}
          >
            女性
          </button>
        </div>

        <div className="mt-6">
          <button
            type="button"
            onClick={() => StepUpdate(1)}
            className="w-full py-2 rounded text-white bg-green-600 hover:opacity-70 disabled:opacity-40"
            disabled={!isFormComplete}
          >
            始める
          </button>
        </div>
      </div>
    </div>
  );
};