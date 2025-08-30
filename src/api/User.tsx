
import { app } from "@/app/provider";
import { UserDataModal } from "@/models/Models";
import { timestampToDate } from "@/utils/generate";
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


export const _setUser = async ({
  id,
  data,
}: {
  id: string;
  data: UserDataModal;
}): Promise<boolean> => {
  try {
    const timestamp = new Date();
    await setDoc(doc(db, "User" , id), {
      ...data,
      timestamp,
    });
    return true;
  } catch {
    return false;
  }
};


export const _getUser = async ({
  id,
}: {
  id: string;
}): Promise<UserDataModal | undefined> => {

  try {
    const snapshot = await getDoc(doc(db, "User", id));
    if (snapshot.exists()) {
      const data = snapshot.data();
      return {
        UserId: id || "", // Ensure UserId is included
        userInformation: data?.userInformation || {}, // Ensure userInformation is included
        UserLastName: data?.UserLastName || "",
        UserFirstName: data?.UserFirstName || "",
        UserAddress: data?.UserAddress || "",
        UserGender: data?.UserGender || "",
        timestamp: data?.timestamp ? timestampToDate(data.timestamp) : undefined,
      } as UserDataModal;
    }
    return;
  } catch (e) {
    console.log(e)
    return;
  }
};

export const _getUnSubscribeUser = async ({
  id,
  setData,
}: {
  id: string;
  setData: Dispatch<UserDataModal[]>;
}) => {
  try {
    const ref = collection(db, "User");
    const queryRef = query(
      ref,
      where(id, "==", id),
    );
    const unsubscribe = onSnapshot(queryRef, (snapshot) => {
      const result: UserDataModal[] = snapshot.docs.map(
        (val) => 
        ({
          UserId: val.id || "", // Ensure UserId is included
          userInformation: val.get("userInformation") || {}, // Ensure userInformation is included
          UserLastName: val.get("UserLastName") || "",
          UserFirstName: val.get("UserFirstName") || "",
          UserAddress: val.get("UserAddress") || "",
          UserGender: val.get("UserGender") || "",
          timestamp: val.get("timestamp") ? new Date(val.get("timestamp")).getTime() : 0,
        } as unknown as UserDataModal) // Cast to unknown before asserting
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

export const _getUsers = async (): Promise<UserDataModal[] | undefined> => {

  try {
    const snapshot = await getDocs(collection(db, "User"));
    const result: UserDataModal[] = [];

    snapshot.docs.forEach((doc) => {
      const data = doc.data() as UserDataModal;
      result.push({
        ...data,
        UserId: doc.id, // ← 必要ならIDは別でセット
      });
    });

    return result;
  } catch (e) {
    console.log(e)
    return;
  }
};

export const _deleteUser = async ({
  id,
}: {
  id: string;
}): Promise<boolean> => {
  try {
    await deleteDoc(doc(db, "User", id));
    return true;
  } catch {
    return false;
  }
};

