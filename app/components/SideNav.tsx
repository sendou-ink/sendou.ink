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
		<nav className={clsx(styles.sideNav, className)}>
			<div className={clsx(styles.sideNavInner, "scrollbar")}>{children}</div>
		</nav>
	);
}

export function SideNavHeader({
	children,
	icon,
}: {
	children: React.ReactNode;
	icon?: React.ReactNode;
}) {
	return (
		<header className={styles.sideNavHeader}>
			{icon ? <div className={styles.iconContainer}>{icon}</div> : null}
			<h2>{children}</h2>
		</header>
	);
}

export function SideNavLink({
	children,
	href,
	onClick,
	isActive,
	imageUrl,
	subtitle,
}: {
	children: React.ReactNode;
	href: string;
	onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
	isActive?: boolean;
	imageUrl?: string;
	subtitle?: string;
}) {
	return (
		<a
			href={href}
			className={styles.sideNavLink}
			onClick={onClick}
			aria-current={isActive ? "page" : undefined}
		>
			{imageUrl ? (
				<img src={imageUrl} alt="" className={styles.sideNavLinkImage} />
			) : null}
			<div className={styles.sideNavLinkContent}>
				<span className={styles.sideNavLinkTitle}>{children}</span>
				{subtitle ? (
					<span className={styles.sideNavLinkSubtitle}>{subtitle}</span>
				) : null}
			</div>
		</a>
	);
}
