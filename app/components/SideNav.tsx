import clsx from "clsx";
import { X } from "lucide-react";
import type * as React from "react";
import { SendouButton } from "~/components/elements/Button";
import styles from "./SideNav.module.css";

export function SideNav({
	children,
	className,
	footer,
	top,
	topCentered,
	collapsed,
	...rest
}: {
	children: React.ReactNode;
	className?: string;
	footer?: React.ReactNode;
	top?: React.ReactNode;
	topCentered?: boolean;
	collapsed?: boolean;
} & Omit<React.ComponentPropsWithRef<"nav">, "children" | "className">) {
	return (
		<nav
			className={clsx(styles.sideNav, className, {
				[styles.sideNavCollapsed]: collapsed,
			})}
			{...rest}
		>
			<div
				className={clsx(styles.sideNavTop, {
					[styles.sideNavTopCentered]: topCentered,
				})}
			>
				{top}
			</div>
			<div className={clsx(styles.sideNavInner, "scrollbar")}>{children}</div>
			{footer}
		</nav>
	);
}

export function SideNavHeader({
	children,
	icon,
	showClose,
	action,
}: {
	children: React.ReactNode;
	icon?: React.ReactNode;
	showClose?: boolean;
	action?: React.ReactNode;
}) {
	return (
		<header className={styles.sideNavHeader}>
			{icon ? <div className={styles.iconContainer}>{icon}</div> : null}
			<h2>{children}</h2>
			{action ? (
				<span className={styles.sideNavHeaderAction}>{action}</span>
			) : null}
			{showClose ? (
				<SendouButton
					icon={<X />}
					variant="minimal"
					slot="close"
					className={styles.sideNavHeaderClose}
				/>
			) : null}
		</header>
	);
}

export function SideNavFooter({ children }: { children: React.ReactNode }) {
	return <div className={styles.sideNavFooter}>{children}</div>;
}

export function NavIconContainer({ children }: { children: React.ReactNode }) {
	return <div className={styles.iconContainer}>{children}</div>;
}
