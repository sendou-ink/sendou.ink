import clsx from "clsx";
import type * as React from "react";
import {
	Dialog,
	DialogTrigger,
	Modal,
	ModalOverlay,
} from "react-aria-components";
import { SendouButton } from "~/components/elements/Button";
import { CrossIcon } from "~/components/icons/Cross";
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
	showClose,
}: {
	children: React.ReactNode;
	icon?: React.ReactNode;
	showClose?: boolean;
}) {
	return (
		<header className={styles.sideNavHeader}>
			{icon ? <div className={styles.iconContainer}>{icon}</div> : null}
			<h2>{children}</h2>
			{showClose ? (
				<SendouButton
					icon={<CrossIcon />}
					variant="minimal"
					slot="close"
					className={styles.sideNavHeaderClose}
				/>
			) : null}
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
	badge,
}: {
	children: React.ReactNode;
	href: string;
	onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
	isActive?: boolean;
	imageUrl?: string;
	subtitle?: string;
	badge?: string;
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
				{subtitle || badge ? (
					<div className={styles.sideNavLinkSubtitleRow}>
						{subtitle ? (
							<span className={styles.sideNavLinkSubtitle}>{subtitle}</span>
						) : null}
						{badge ? (
							<span className={styles.sideNavLinkBadge}>{badge}</span>
						) : null}
					</div>
				) : null}
			</div>
		</a>
	);
}

export function SideNavPanel({
	children,
	trigger,
}: {
	children: React.ReactNode;
	trigger: React.ReactNode;
}) {
	return (
		<DialogTrigger>
			{trigger}
			<ModalOverlay className={styles.sideNavPanelOverlay} isDismissable>
				<Modal className={clsx(styles.sideNavPanel, "scrollbar")}>
					<Dialog className={styles.sideNavPanelDialog}>{children}</Dialog>
				</Modal>
			</ModalOverlay>
		</DialogTrigger>
	);
}
