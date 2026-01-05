import clsx from "clsx";
import type * as React from "react";
import styles from "./SideNav.module.css";

export function SideNav({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<nav className={clsx(styles.sideNav, "scrollbar", className)}>
			{children}
		</nav>
	);
}

export function SideNavLink({
	children,
	href,
	onClick,
	isActive,
}: {
	children: React.ReactNode;
	href: string;
	onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
	isActive?: boolean;
}) {
	return (
		<a
			href={href}
			className={styles.sideNavLink}
			onClick={onClick}
			aria-current={isActive ? "page" : undefined}
		>
			{children}
		</a>
	);
}
