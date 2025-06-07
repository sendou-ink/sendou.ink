import { Link } from "@remix-run/react";
import type { LinkProps } from "@remix-run/react";
import clsx from "clsx";
import * as React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	variant?:
		| "primary"
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

type LinkButtonProps = Pick<
	ButtonProps,
	"variant" | "children" | "className" | "size" | "testId" | "icon"
> &
	Pick<LinkProps, "to" | "prefetch" | "preventScrollReset"> & {
		"data-cy"?: string;
		isExternal?: boolean;
		onClick?: () => void;
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
	onClick,
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
				onClick={onClick}
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
