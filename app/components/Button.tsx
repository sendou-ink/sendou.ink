import { Link } from "@remix-run/react";
import type { LinkProps } from "@remix-run/react";
import clsx from "clsx";
import * as React from "react";

export interface ButtonProps
	extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	variant?:
		| "success"
		| "outlined"
		| "outlined-success"
		| "destructive"
		| "minimal"
		| "minimal-success"
		| "minimal-destructive";
	size?: "miniscule" | "tiny" | "big";
	loading?: boolean;
	loadingText?: string;
	icon?: JSX.Element;
	testId?: string;
	_ref?: React.LegacyRef<HTMLButtonElement> | React.ForwardedRef<unknown>;
}

export function Button(props: ButtonProps) {
	const {
		variant,
		loading,
		children,
		loadingText,
		size,
		className,
		icon,
		type = "button",
		testId,
		_ref,
		...rest
	} = props;
	return (
		<button
			className={clsx(
				"button",
				variant,
				{
					"disabled-opaque": props.disabled,
					loading,
					tiny: size === "tiny",
					big: size === "big",
					miniscule: size === "miniscule",
				},
				className,
			)}
			disabled={props.disabled || loading}
			type={type}
			data-testid={testId}
			ref={props._ref as React.LegacyRef<HTMLButtonElement>}
			{...rest}
		>
			{icon &&
				React.cloneElement(icon, {
					className: clsx("button-icon", { lonely: !children }),
					title: rest.title,
				})}
			{loading && loadingText ? loadingText : children}
		</button>
	);
}

type LinkButtonProps = Pick<
	ButtonProps,
	"variant" | "children" | "className" | "size" | "testId" | "icon"
> &
	Pick<LinkProps, "to" | "prefetch" | "preventScrollReset"> & {
		"data-cy"?: string;
	} & {
		isExternal?: boolean;
	};

export function LinkButton({
	variant,
	children,
	size,
	className,
	to,
	prefetch,
	isExternal,
	testId,
	icon,
	preventScrollReset,
}: LinkButtonProps) {
	if (isExternal) {
		return (
			<a
				className={clsx(
					"button",
					variant,
					{ tiny: size === "tiny", big: size === "big" },
					className,
				)}
				href={to as string}
				data-testid={testId}
				target="_blank"
				rel="noreferrer"
			>
				{icon &&
					React.cloneElement(icon, {
						className: clsx("button-icon", {
							lonely: !children,
						}),
					})}
				{children}
			</a>
		);
	}

	return (
		<Link
			className={clsx(
				"button",
				variant,
				{ tiny: size === "tiny", big: size === "big" },
				className,
			)}
			to={to}
			data-testid={testId}
			prefetch={prefetch}
			preventScrollReset={preventScrollReset}
		>
			{icon &&
				React.cloneElement(icon, {
					className: clsx("button-icon", { lonely: !children }),
				})}
			{children}
		</Link>
	);
}
