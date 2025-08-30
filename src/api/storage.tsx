import { isJpeg, isJpg, isPng } from "@/utils/checkConfig";
import { fileToBlobAndUrl } from "@/utils/generate";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";

export const _uploadImage = async ({
  image,
  id,
}: {
  image: File;
  id: string;
}) => {
  try {
    if (!image) return;
    const isImage =
      isPng(image.name) || isJpeg(image.name) || isJpg(image.name);
    if (!isImage) return;
    const storage = getStorage();
    let extension: string = ".png";
    if (isPng(image.name)) {
      extension = ".png";
    } else if (isJpeg(image.name)) {
      extension = ".jpeg";
    } else if (isJpg(image.name)) {
      extension = ".jpg";
    }
    const storageRef = ref(storage, "thumbnails/" + id + extension);
    const uploadFile = await fileToBlobAndUrl({ file: image });
    const upload = await uploadBytes(storageRef, uploadFile.blob);
    const uploadURL = await getDownloadURL(upload.ref);
    return uploadURL;
  } catch (e) {
    console.log(e)
    return;
  }
};
