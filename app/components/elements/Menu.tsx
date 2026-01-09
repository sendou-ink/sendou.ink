import clsx from "clsx";
import {
	Menu,
	MenuItem,
	type MenuItemProps,
	MenuTrigger,
	Popover,
	type PopoverProps,
} from "react-aria-components";
import { Image } from "../Image";
import styles from "./Menu.module.css";

interface SendouMenuProps {
	trigger: React.ReactNode;
	scrolling?: boolean;
	opensLeft?: boolean;
	children: React.ReactNode;
	popoverClassName?: string;
	placement?: PopoverProps["placement"];
}

export function SendouMenu({
	children,
	trigger,
	opensLeft,
	scrolling,
	placement,
}: SendouMenuProps) {
	return (
		<MenuTrigger>
			{trigger}
			<Popover
				placement={placement}
				className={clsx(styles.popover, "scrollbar", {
					[styles.scrolling]: scrolling,
					[styles.popoverOpensLeft]: !opensLeft,
				})}
			>
				<Menu className={styles.itemsContainer}>{children}</Menu>
			</Popover>
		</MenuTrigger>
	);
}

export interface SendouMenuItemProps extends MenuItemProps {
	icon?: React.ReactNode;
	imagePath?: string;
	isActive?: boolean;
}

export function SendouMenuItem(props: SendouMenuItemProps) {
	const textValue =
		props.textValue ??
		(typeof props.children === "string" ? props.children : undefined);
	return (
		<MenuItem
			{...props}
			textValue={textValue}
			className={({ isSelected, isDisabled }) =>
				clsx(styles.item, {
					[styles.itemSelected]: isSelected,
					[styles.itemDisabled]: isDisabled,
					[styles.itemActive]: props.isActive,
				})
			}
		>
			{/** biome-ignore lint/complexity/noUselessFragments: Biome v2 migration */}
			<>
				{props.icon ? (
					<span className={styles.itemIcon}>{props.icon}</span>
				) : null}
				{props.imagePath ? (
					<Image
						path={props.imagePath}
						alt=""
						width={20}
						height={20}
						className={styles.itemImg}
					/>
				) : null}
				{props.children}
			</>
		</MenuItem>
	);
}
