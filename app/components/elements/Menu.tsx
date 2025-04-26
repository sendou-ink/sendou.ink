import clsx from "clsx";
import {
	Menu,
	MenuItem,
	type MenuItemProps,
	MenuTrigger,
	Popover,
} from "react-aria-components";
import { Image } from "../Image";
import styles from "./Menu.module.css";

interface SendouMenuProps {
	trigger: React.ReactNode;
	scrolling?: boolean;
	opensLeft?: boolean;
	children: React.ReactNode;
}

export function SendouMenu({
	children,
	trigger,
	opensLeft,
	scrolling,
}: SendouMenuProps) {
	return (
		<MenuTrigger>
			{trigger}
			<Popover
				className={clsx(styles.itemsContainer, {
					[styles.scrolling]: scrolling,
					[styles.itemsContainerOpensLeft]: !opensLeft,
				})}
			>
				<Menu>{children}</Menu>
			</Popover>
		</MenuTrigger>
	);
}

export interface SendouMenuItemProps extends MenuItemProps {
	icon?: React.ReactNode;
	imagePath?: string;
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
				})
			}
		>
			<>
				{props.icon ? (
					<span className={styles.itemIcon}>{props.icon}</span>
				) : null}
				{props.imagePath ? (
					<Image
						path={props.imagePath}
						alt=""
						width={24}
						height={24}
						className={styles.itemImg}
					/>
				) : null}
				{props.children}
			</>
		</MenuItem>
	);
}
