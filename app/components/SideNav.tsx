import clsx from "clsx";
import { X } from "lucide-react";
import type * as React from "react";
import { Button } from "react-aria-components";
import { Link } from "react-router";
import { SendouButton } from "~/components/elements/Button";
import type { Tables } from "~/db/tables";
import { Avatar } from "./Avatar";
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

export function ListLink({
	children,
	to,
	onClick,
	isActive,
	imageUrl,
	overlayIconUrl,
	user,
	subtitle,
	badge,
	badgeVariant,
}: {
	children: React.ReactNode;
	to: string;
	onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
	isActive?: boolean;
	imageUrl?: string;
	overlayIconUrl?: string;
	user?: Pick<Tables["User"], "discordId" | "discordAvatar">;
	subtitle?: React.ReactNode;
	badge?: string | null;
	badgeVariant?: "default" | "warning";
}) {
	return (
		<Link
			to={to}
			className={styles.listLink}
			onClick={onClick}
			aria-current={isActive ? "page" : undefined}
		>
			{user ? (
				<Avatar user={user} size="xxsm" />
			) : imageUrl ? (
				<div className={styles.listLinkImageContainer}>
					<img src={imageUrl} alt="" className={styles.listLinkImage} />
					{overlayIconUrl ? (
						<img
							src={overlayIconUrl}
							alt=""
							className={styles.listLinkOverlayIcon}
						/>
					) : null}
				</div>
			) : null}
			<div className={styles.listLinkContent}>
				<span className={styles.listLinkTitle}>{children}</span>
				{subtitle || badge ? (
					<div className={styles.listLinkSubtitleRow}>
						{subtitle ? (
							<span className={styles.listLinkSubtitle}>{subtitle}</span>
						) : null}
						{badge ? (
							<span
								className={clsx(styles.listLinkBadge, {
									[styles.listLinkBadgeWarning]: badgeVariant === "warning",
								})}
							>
								{badge}
							</span>
						) : null}
					</div>
				) : null}
			</div>
		</Link>
	);
}

export function ListButton({
	children,
	user,
	subtitle,
	badge,
	badgeVariant,
}: {
	children: React.ReactNode;
	user?: Pick<Tables["User"], "discordId" | "discordAvatar">;
	subtitle?: string | null;
	badge?: string | null;
	badgeVariant?: "default" | "warning";
}) {
	return (
		<Button className={styles.listButton}>
			{user ? <Avatar user={user} size="xxsm" /> : null}
			<div className={styles.listLinkContent}>
				<span className={styles.listLinkTitle}>{children}</span>
				{subtitle || badge ? (
					<div className={styles.listLinkSubtitleRow}>
						{subtitle ? (
							<span className={styles.listLinkSubtitle}>{subtitle}</span>
						) : null}
						{badge ? (
							<span
								className={clsx(styles.listLinkBadge, {
									[styles.listLinkBadgeWarning]: badgeVariant === "warning",
								})}
							>
								{badge}
							</span>
						) : null}
					</div>
				) : null}
			</div>
		</Button>
	);
}

export function SideNavFooter({ children }: { children: React.ReactNode }) {
	return <div className={styles.sideNavFooter}>{children}</div>;
}
