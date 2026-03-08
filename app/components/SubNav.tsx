import clsx from "clsx";
import type * as React from "react";
import type { LinkProps } from "react-router";
import { NavLink } from "react-router";
import styles from "./SubNav.module.css";

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
				className={clsx(styles.container, {
					[styles.secondary]: secondary,
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
				clsx(styles.linkContainer, {
					[styles.active]: controlled ? active : state.isActive,
					pending: state.isPending,
				})
			}
			end={end}
			{...props}
		>
			<div
				className={clsx(styles.link, className, {
					[styles.linkSecondary]: secondary,
				})}
			>
				{children}
			</div>
			<div
				className={clsx(styles.borderGuy, {
					[styles.borderGuySecondary]: secondary,
				})}
			/>
		</NavLink>
	);
}
