import { Icons, IconType } from "./Icons";
import { Text } from "./Text";
import { MenuContent, MenuItem, MenuRoot, MenuTrigger } from "./ui/menu";

export type MenuType = {
  label: string;
  value: string;
  action: () => void;
};
type Props = {
  menuItem: MenuType[];
  triggerIcon?: IconType;
};
export const CustomMenu = (props: Props) => {
  return (
    <MenuRoot>
      <MenuTrigger>
        <Icons icon={props.triggerIcon ?? "menu"} boxSize="25" />
      </MenuTrigger>
      <MenuContent>
        {props.menuItem.map((menuVal, index) => {
          return (
            <MenuItem
              value={menuVal.value}
              key={index}
              onClick={menuVal.action}
            >
              <Text text={menuVal.label} />
            </MenuItem>
          );
        })}
      </MenuContent>
    </MenuRoot>
  );
};
