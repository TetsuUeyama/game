export const clipBoardCopy = async (text: string) => {
  await navigator.clipboard.writeText(text);
};
