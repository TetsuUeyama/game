
import { app } from "@/app/provider";
import { AnswerDataModel } from "@/models/Models";
import { limit } from "firebase/firestore";

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { Dispatch } from "react";

const db = getFirestore(app);

export const _setAnswer = async ({
  id,
  data,
}: {
  id: string;
  data: AnswerDataModel;
}): Promise<boolean> => {
  try {
    const timestamp = new Date();
    await setDoc(doc(db, "Answer" , id), {
      ...data,
      timestamp,
    });
    return true;
  } catch {
    return false;
  }
};

export const _getAnswer = async ({
  id,
}: {
  id: string;
}): Promise<AnswerDataModel | undefined> => {
  try {
    const snapshot = await getDoc(doc(db, "Answer", id));
    if (snapshot.exists()) {
      const data = snapshot.data();
      return {
        ...(data as AnswerDataModel),
        timestamp: data?.timestampToDate(snapshot.get("timestamp")),
      };
    }
    return;
  } catch (e) {
    console.log(e)
    return;
  }
};

export const _getAnswerByDataId = async (dataId: string): Promise<AnswerDataModel | undefined> => {

  try {
    const q = query(
      collection(db, "Answer"),
      where("dataId", "==", dataId),
      limit(1)
    );
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      const doc = snapshot.docs[0];
      const data = doc.data();
      const timestamp = doc.get("timestamp");

      return {
        ...(data as AnswerDataModel),
        timestamp: timestamp ? timestamp.toDate().getTime() : undefined,  // ←ここ修正
      };
    }

    return;
  } catch (e) {
    console.log(e)
    return;
  }
};

export const _getUnSubscribeAnswer = async ({
  id,
  setData,
}: {
  id: string;
  setData: Dispatch<AnswerDataModel[]>;
}) => {
  try {
    const ref = collection(db, "Answer");
    const queryRef = query(
      ref,
      where(id, "==", id),
    );
    const unsubscribe = onSnapshot(queryRef, (snapshot) => {
      const result: AnswerDataModel[] = snapshot.docs.map(
        (val) => 
        ({
          ...(val.data() as AnswerDataModel),
          timestamp: val.get("timestamp"),
        })
      );
      if (result) {
        setData(result);
      }
    });
    return () => unsubscribe();
  } catch (e) {
    console.log(e)
    return;
  }
};
export const _getAnswers = async (): Promise<AnswerDataModel[] | undefined> => {

  try {
    const snapshot = await getDocs(collection(db, "Answer"));
    const result: AnswerDataModel[] = [];
    snapshot.docs.map((val) => {
      const data = val.data();
      result.push({
        ...(data as AnswerDataModel),
        timestamp: data?.timestampToDate(val.get("timestamp")), // 修正: valからtimestampを取得
      });
    });
    return result;
  } catch (e) {
    console.log(e)
    return;
  }
};
export const _deleteAnswer = async ({
  id,
}: {
  id: string;
}): Promise<boolean> => {
  try {
    await deleteDoc(doc(db, "Answer", id));
    return true;
  } catch {
    return false;
  }
};

