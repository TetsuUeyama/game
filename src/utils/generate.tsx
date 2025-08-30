import { v4 as uuidv4 } from "uuid";
import { Timestamp } from "firebase/firestore";

export const randomId = () => {
  const uuid = uuidv4();
  return String(uuid);
};

export const dateString = ({ date }: { date: Date }) => {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
};
export const dateStart = ({ dateString }: { dateString: Date }) => {
  if (!dateString) return undefined;
  return new Date(`${dateString} 00:00:00`);
};
export const dateEnd = ({ dateString }: { dateString: Date }) => {
  if (!dateString) return undefined;
  return new Date(`${dateString} 23:59:59`);
};
export const timestampToDate = (timestamp: Timestamp) => {
  return new Date(timestamp.seconds * 1000);
};
export const fileToBlobAndUrl = ({ file }: { file: File }) => {
  return new Promise<{ blob: Blob; url: string }>((resolve) => {
    const url = URL.createObjectURL(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      const arrayBuffer = event.target?.result;
      if (arrayBuffer) {
        const blob = new Blob([arrayBuffer]);
        resolve({ blob: blob, url: url });
      }
    };
    reader.readAsArrayBuffer(file);
  });
};
export const jpPhoneNumber = (phoneNumber: string) => {
  return phoneNumber.replace(/0/, "+81");
};
export const convertToHalfWidth = (text: string) => {
  return text.replace(/[0-9]/g, (s) => {
    return String.fromCharCode(s.charCodeAt(0) - 0xfee0);
  });
};
export const zeroPadding = (number: string | number) => {
  return number.toString().padStart(2, "0");
};
export const linkFunc = ({ url }: { url: string }) => {
  const element = document.createElement("a");
  element.href = url;
  element.target = "_blank";
  element.click();
  return;
};
