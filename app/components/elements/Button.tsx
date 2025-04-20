import clsx from "clsx";
import * as React from "react";
import {
	Button as ReactAriaButton,
	type ButtonProps as ReactAriaButtonProps,
} from "react-aria-components";
import { assertUnreachable } from "~/utils/types";
import styles from "./Button.module.css";

type ButtonVariant =
	| "primary"
	| "success"
	| "outlined"
	| "outlined-success"
	| "destructive"
	| "minimal"
	| "minimal-success"
	| "minimal-destructive";

interface MyDatePickerProps extends ReactAriaButtonProps {
	variant?: ButtonVariant;
	size?: "miniscule" | "small" | "medium" | "big";
	icon?: JSX.Element;
	children?: React.ReactNode;
}

export function SendouButton({
	children,
	variant,
	size,
	className,
	icon,
	...rest
}: MyDatePickerProps) {
	const variantClassname = variant ? variantToClassname(variant) : null;

	return (
		<ReactAriaButton
			{...rest}
			className={clsx(className, variantClassname, styles.button, {
				[styles.small]: size === "small",
				[styles.big]: size === "big",
				[styles.miniscule]: size === "miniscule",
			})}
		>
			{icon &&
				React.cloneElement(icon, {
					className: clsx(icon.props.className, styles.buttonIcon, {
						[styles.lonely]: !children,
					}),
				})}
			{children}
		</ReactAriaButton>
	);
}

function variantToClassname(variant: ButtonVariant) {
	switch (variant) {
		case "primary":
			return styles.primary;
		case "success":
			return styles.success;
		case "outlined":
			return styles.outlined;
		case "outlined-success":
			return styles.outlinedSuccess;
		case "destructive":
			return styles.destructive;
		case "minimal":
			return styles.minimal;
		case "minimal-success":
			return styles.minimalSuccess;
		case "minimal-destructive":
			return styles.minimalDestructive;
		default:
			return assertUnreachable(variant);
	}
}
