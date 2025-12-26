import { Link, type LinkProps } from "@remix-run/react";
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
	| "destructive"
	| "outlined"
	| "outlined-success"
	| "outlined-destructive"
	| "minimal"
	| "minimal-success"
	| "minimal-destructive";

export interface SendouButtonProps
	extends Omit<ReactAriaButtonProps, "onClick" | "className"> {
	className?: string;
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
}: SendouButtonProps) {
	return (
		<ReactAriaButton
			{...rest}
			className={buttonClassName({ className, variant, size })}
		>
			{icon &&
				React.cloneElement(icon, {
					className: iconClassName(icon.props.className, children, size),
				})}
			{children}
		</ReactAriaButton>
	);
}

export interface LinkButtonProps {
	to: LinkProps["to"];
	prefetch?: LinkProps["prefetch"];
	preventScrollReset?: LinkProps["preventScrollReset"];
	isExternal?: boolean;
	className?: string;
	variant?: SendouButtonProps["variant"];
	size?: SendouButtonProps["size"];
	icon?: JSX.Element;
	children?: React.ReactNode;
	onClick?: React.MouseEventHandler<HTMLAnchorElement>;
	testId?: string;
}

export function LinkButton({
	to,
	prefetch,
	preventScrollReset,
	isExternal,
	className,
	variant,
	size,
	icon,
	children,
	onClick,
	testId,
}: LinkButtonProps) {
	if (isExternal) {
		return (
			<a
				className={buttonClassName({ className, variant, size })}
				href={to as string}
				target="_blank"
				rel="noreferrer"
				onClick={onClick}
				data-testid={testId}
			>
				{icon &&
					React.cloneElement(icon, {
						className: iconClassName(icon.props.className, children, size),
					})}
				{children}
			</a>
		);
	}

	return (
		<Link
			className={buttonClassName({ className, variant, size })}
			to={to}
			data-testid={testId}
			prefetch={prefetch}
			preventScrollReset={preventScrollReset}
		>
			{icon &&
				React.cloneElement(icon, {
					className: iconClassName(icon.props.className, children, size),
				})}
			{children}
		</Link>
	);
}

function buttonClassName({
	className,
	variant,
	size,
}: Pick<SendouButtonProps, "className" | "variant" | "size">) {
	const variantToClassname = (variant: ButtonVariant) => {
		switch (variant) {
			case "primary":
				return styles.primary;
			case "success":
				return styles.success;
			case "destructive":
				return styles.destructive;
			case "outlined":
				return styles.outlined;
			case "outlined-success":
				return styles.outlinedSuccess;
			case "outlined-destructive":
				return styles.outlinedDestructive;
			case "minimal":
				return styles.minimal;
			case "minimal-success":
				return styles.minimalSuccess;
			case "minimal-destructive":
				return styles.minimalDestructive;
			default:
				return assertUnreachable(variant);
		}
	};

	return clsx(
		className,
		variant ? variantToClassname(variant) : null,
		styles.button,
		{
			[styles.small]: size === "small",
			[styles.big]: size === "big",
			[styles.miniscule]: size === "miniscule",
		},
	);
}

function iconClassName(
	baseClassName: string | undefined,
	children: React.ReactNode,
	size: SendouButtonProps["size"],
) {
	return clsx(baseClassName, styles.buttonIcon, {
		[styles.lonely]: !children,
		[styles.buttonIconSmall]: size === "small",
		[styles.buttonIconMiniscule]: size === "miniscule",
	});
}
