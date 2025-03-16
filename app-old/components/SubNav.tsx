import { NavLink } from "@remix-run/react";
import type { LinkProps } from "@remix-run/react";
import clsx from "clsx";
import type * as React from "react";

export function SubNav({
	children,
	secondary,
}: {
	children: React.ReactNode;
	secondary?: boolean;
}) {
	return (
		<div>
			<nav
				className={clsx("sub-nav__container", {
					"sub-nav__container__secondary": secondary,
				})}
			>
				{children}
			</nav>
		</div>
	);
}

export function SubNavLink({
	children,
	className,
	end = true,
	secondary = false,
	controlled = false,
	active = false,
	...props
}: LinkProps & {
	end?: boolean;
	children: React.ReactNode;
	secondary?: boolean;
	controlled?: boolean;
	active?: boolean;
}) {
	return (
		<NavLink
			className={(state) =>
				clsx("sub-nav__link__container", {
					active: controlled ? active : state.isActive,
					pending: state.isPending,
				})
			}
			end={end}
			{...props}
		>
			<div
				className={clsx("sub-nav__link", className, {
					"sub-nav__link__secondary": secondary,
				})}
			>
				{children}
			</div>
			<div
				className={clsx("sub-nav__border-guy", {
					"sub-nav__border-guy__secondary": secondary,
				})}
			/>
		</NavLink>
	);
}
