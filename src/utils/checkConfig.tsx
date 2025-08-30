export const isPng = (fileName: string) => {
  return fileName?.endsWith(".png") || fileName?.endsWith(".PNG");
};
export const isJpeg = (fileName: string) => {
  return fileName?.endsWith(".jpeg") || fileName?.endsWith(".JPEG");
};
export const isJpg = (fileName: string) => {
  return fileName?.endsWith(".jpg") || fileName?.endsWith(".JPG");
};
