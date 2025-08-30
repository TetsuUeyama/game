import {
  FaPlus,
  FaMinus,
  FaPersonWalkingArrowRight,
  FaRegBuilding,
  FaYenSign,
  FaReply,
} from "react-icons/fa6";
import {
  MdFilterAlt,
  MdOutlineEdit,
  MdOutlineKeyboardDoubleArrowDown,
  MdDelete,
} from "react-icons/md";
import {
  IoImageOutline,
  IoClose,
  IoSearch,
  IoArrowForwardCircle,
  IoChatbubbleEllipsesOutline,
  IoSend,
  IoNotifications,
} from "react-icons/io5";
import { GrStatusGood } from "react-icons/gr";
import {
  FaRegCircle,
  FaCircle,
  FaRegStar,
  FaStar,
  FaUserPlus,
  FaSortAlphaDown,
  FaStethoscope,
  FaUserAlt,
} from "react-icons/fa";
import { GiHamburgerMenu, GiSittingDog } from "react-icons/gi";
import { BsThreeDots } from "react-icons/bs";
import { LuQrCode, LuFileText } from "react-icons/lu";
import { AiOutlineSmile } from "react-icons/ai";
import {
  FiSun,
  FiMoon,
  FiMail,
  FiKey,
  FiEye,
  FiEyeOff,
  FiCopy,
  FiAlertCircle,
  FiSettings,
} from "react-icons/fi";
import { PiDog } from "react-icons/pi";
import { GoCodeOfConduct } from "react-icons/go";
import { Box } from "@chakra-ui/react";

export type IconType =
  | "plus"
  | "image"
  | "circle"
  | "close"
  | "menu"
  | "star"
  | "qrCode"
  | "starOutline"
  | "setting"
  | "openEye"
  | "closeEye"
  | "minus"
  | "sort"
  | "edit"
  | "mail"
  | "key"
  | "addUser"
  | "user"
  | "inviteUser"
  | "search"
  | "report"
  | "sun"
  | "moon"
  | "copy"
  | "alert"
  | "dog"
  | "building"
  | "invited"
  | "stethoscope"
  | "sittingDog"
  | "yen"
  | "good"
  | "arrowDown"
  | "arrowRight"
  | "reply"
  | "chat"
  | "send"
  | "smile"
  | "delete"
  | "notify"
  | "fillCircle"
  | "threeDots"
  | "filter";

type Props = {
  icon: IconType;
  boxSize?: string;
  cursor?: "default" | "none" | "pointer";
  color?: string;
  onClick?: () => void;
  isCircle?: boolean;
  circleBgColor?: string;
};
export const Icons = ({
  icon,
  boxSize,
  cursor = "default",
  color,
  onClick,
  isCircle,
  circleBgColor,
}: Props) => {
  const iconList = () => {
    if (icon === "plus") {
      return <FaPlus size={boxSize} color={color} />;
    } else if (icon === "image") {
      return <IoImageOutline size={boxSize} color={color} />;
    } else if (icon === "circle") {
      return <FaRegCircle size={boxSize} color={color} />;
    } else if (icon === "fillCircle") {
      return <FaCircle size={boxSize} color={color} />;
    } else if (icon === "close") {
      return <IoClose size={boxSize} color={color} />;
    } else if (icon === "menu") {
      return <GiHamburgerMenu size={boxSize} color={color} />;
    } else if (icon === "star") {
      return <FaStar size={boxSize} color={color} />;
    } else if (icon === "starOutline") {
      return <FaRegStar size={boxSize} color={color} />;
    } else if (icon === "minus") {
      return <FaMinus size={boxSize} color={color} />;
    } else if (icon === "qrCode") {
      return <LuQrCode size={boxSize} color={color} />;
    } else if (icon === "setting") {
      return <FiSettings size={boxSize} color={color} />;
    } else if (icon === "openEye") {
      return <FiEye size={boxSize} color={color} />;
    } else if (icon === "closeEye") {
      return <FiEyeOff size={boxSize} color={color} />;
    } else if (icon === "filter") {
      return <MdFilterAlt size={boxSize} color={color} />;
    } else if (icon === "sort") {
      return <FaSortAlphaDown size={boxSize} color={color} />;
    } else if (icon === "edit") {
      return <MdOutlineEdit size={boxSize} color={color} />;
    } else if (icon === "mail") {
      return <FiMail size={boxSize} color={color} />;
    } else if (icon === "key") {
      return <FiKey size={boxSize} color={color} />;
    } else if (icon === "addUser") {
      return <FaUserPlus size={boxSize} color={color} />;
    } else if (icon === "inviteUser") {
      return <FaPersonWalkingArrowRight size={boxSize} color={color} />;
    } else if (icon === "user") {
      return <FaUserAlt size={boxSize} color={color} />;
    } else if (icon === "search") {
      return <IoSearch size={boxSize} color={color} />;
    } else if (icon === "report") {
      return <LuFileText size={boxSize} color={color} />;
    } else if (icon === "sun") {
      return <FiSun size={boxSize} color={color} />;
    } else if (icon === "moon") {
      return <FiMoon size={boxSize} color={color} />;
    } else if (icon === "copy") {
      return <FiCopy size={boxSize} color={color} />;
    } else if (icon === "alert") {
      return <FiAlertCircle size={boxSize} color={color} />;
    } else if (icon === "dog") {
      return <PiDog size={boxSize} color={color} />;
    } else if (icon === "building") {
      return <FaRegBuilding size={boxSize} color={color} />;
    } else if (icon === "invited") {
      return <GoCodeOfConduct size={boxSize} color={color} />;
    } else if (icon === "stethoscope") {
      return <FaStethoscope size={boxSize} color={color} />;
    } else if (icon === "sittingDog") {
      return <GiSittingDog size={boxSize} color={color} />;
    } else if (icon === "yen") {
      return <FaYenSign size={boxSize} color={color} />;
    } else if (icon === "good") {
      return <GrStatusGood size={boxSize} color={color} />;
    } else if (icon === "arrowDown") {
      return <MdOutlineKeyboardDoubleArrowDown size={boxSize} color={color} />;
    } else if (icon === "arrowRight") {
      return <IoArrowForwardCircle size={boxSize} color={color} />;
    } else if (icon === "reply") {
      return <FaReply size={boxSize} color={color} />;
    } else if (icon === "chat") {
      return <IoChatbubbleEllipsesOutline size={boxSize} color={color} />;
    } else if (icon === "smile") {
      return <AiOutlineSmile size={boxSize} color={color} />;
    } else if (icon === "send") {
      return <IoSend size={boxSize} color={color} />;
    } else if (icon === "delete") {
      return <MdDelete size={boxSize} color={color} />;
    } else if (icon === "notify") {
      return <IoNotifications size={boxSize} color={color} />;
    } else if (icon === "threeDots") {
      return <BsThreeDots size={boxSize} color={color} />;
    }
  };
  return (
    <Box
      cursor={cursor}
      onClick={onClick}
      border={isCircle ? `1px solid` : undefined}
      borderRadius={50}
      bg={circleBgColor}
      p={1}
    >
      {iconList()}
    </Box>
  );
};
