import clsx from "clsx";
import * as React from "react";
import {
	Button as ReactAriaButton,
	type ButtonProps as ReactAriaButtonProps,
} from "react-aria-components";

interface MyDatePickerProps extends ReactAriaButtonProps {
	variant?:
		| "success"
		| "outlined"
		| "outlined-success"
		| "destructive"
		| "minimal"
		| "minimal-success"
		| "minimal-destructive";
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
	return (
		<ReactAriaButton
			{...rest}
			className={clsx(
				"react-aria-Button",
				variant,
				{
					small: size === "small",
					big: size === "big",
					miniscule: size === "miniscule",
				},
				className,
			)}
		>
			{icon &&
				React.cloneElement(icon, {
					className: clsx(icon.props.className, "sendou-button-icon", {
						lonely: !children,
					}),
				})}
			{children}
		</ReactAriaButton>
	);
}
