import clsx from "clsx";
import { X } from "lucide-react";
import type * as React from "react";
import {
	Dialog,
	DialogTrigger,
	Modal,
	ModalOverlay,
} from "react-aria-components";
import { Link } from "react-router";
import { SendouButton } from "~/components/elements/Button";
import { Image } from "./Image";
import styles from "./SideNav.module.css";

export function SideNav({
	children,
	className,
	footer,
	top,
	topCentered,
	collapsed,
}: {
	children: React.ReactNode;
	className?: string;
	footer?: React.ReactNode;
	top?: React.ReactNode;
	topCentered?: boolean;
	collapsed?: boolean;
}) {
	return (
		<nav
			className={clsx(styles.sideNav, className, {
				[styles.sideNavCollapsed]: collapsed,
			})}
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
					icon={<X />}
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
	to,
	onClick,
	isActive,
	imageUrl,
	subtitle,
	badge,
}: {
	children: React.ReactNode;
	to: string;
	onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
	isActive?: boolean;
	imageUrl?: string;
	subtitle?: string;
	badge?: string;
}) {
	return (
		<Link
			to={to}
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
		</Link>
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

export function SideNavFooter({ children }: { children: React.ReactNode }) {
	return <div className={styles.sideNavFooter}>{children}</div>;
}

export function SideNavGameStatus({
	iconUrl,
	imageUrl,
	text,
	href,
}: {
	iconUrl?: string;
	imageUrl?: string;
	text: string;
	href: string;
}) {
	return (
		<Link to={href} className={styles.sideNavGameStatus}>
			<div
				className={
					imageUrl
						? styles.sideNavGameStatusIconImg
						: styles.sideNavGameStatusIcon
				}
			>
				{iconUrl ? (
					<Image path={iconUrl} alt="" />
				) : imageUrl ? (
					<img
						src={imageUrl}
						alt=""
						className={styles.sideNavGameStatusImage}
					/>
				) : null}
			</div>
			<span>{text}</span>
		</Link>
	);
}
