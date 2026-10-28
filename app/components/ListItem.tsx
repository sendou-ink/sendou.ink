import clsx from "clsx";
import type * as React from "react";
import { Link } from "react-router";
import type { CommonUser } from "~/utils/kysely.server";
import { Avatar } from "./Avatar";
import styles from "./ListItem.module.css";

export function ListLink({
	children,
	to,
	isActive,
	icon,
	imageUrl,
	overlayIconUrl,
	user,
	subtitle,
	badge,
	badgeVariant,
}: {
	children: React.ReactNode;
	to: string;
	isActive?: boolean;
	icon?: React.ReactNode;
	imageUrl?: string;
	overlayIconUrl?: string;
	user?: Pick<CommonUser, "id" | "avatar">;
	subtitle?: React.ReactNode;
	badge?: React.ReactNode;
	badgeVariant?: "default" | "warning";
}) {
	return (
		<Link
			to={to}
			prefetch="intent"
			className={styles.listLink}
			aria-current={isActive ? "page" : undefined}
		>
			<ListItemContent
				icon={icon}
				user={user}
				imageUrl={imageUrl}
				overlayIconUrl={overlayIconUrl}
				subtitle={subtitle}
				badge={badge}
				badgeVariant={badgeVariant}
				suppressSubtitleHydrationWarning
			>
				{children}
			</ListItemContent>
		</Link>
	);
}

export function ListButton({
	children,
	user,
	subtitle,
	badge,
	badgeVariant,
	...rest
}: {
	children: React.ReactNode;
	user?: Pick<CommonUser, "id" | "avatar">;
	subtitle?: string | null;
	badge?: string | null;
	badgeVariant?: "default" | "warning";
} & Omit<React.ComponentPropsWithoutRef<"button">, "children">) {
	return (
		<button type="button" className={styles.listButton} {...rest}>
			<ListItemContent
				user={user}
				subtitle={subtitle}
				badge={badge}
				badgeVariant={badgeVariant}
			>
				{children}
			</ListItemContent>
		</button>
	);
}

export function ListItemButton({
	children,
	className,
	onClick,
}: {
	children: React.ReactNode;
	className?: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			className={clsx(styles.listButton, className)}
			onClick={onClick}
		>
			{children}
		</button>
	);
}

export function ListItemImage({ src }: { src: string }) {
	return <img src={src} alt="" className={styles.listLinkImage} />;
}

export function ListItemTexts({ children }: { children: React.ReactNode }) {
	return <div className={styles.listLinkContent}>{children}</div>;
}

export function ListItemTitle({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<span className={clsx(styles.listLinkTitle, "truncate", className)}>
			{children}
		</span>
	);
}

export function ListItemSubtitle({ children }: { children: React.ReactNode }) {
	return (
		<span className={clsx(styles.listLinkSubtitle, "truncate")}>
			{children}
		</span>
	);
}

function ListItemContent({
	children,
	icon,
	user,
	imageUrl,
	overlayIconUrl,
	subtitle,
	badge,
	badgeVariant,
	suppressSubtitleHydrationWarning,
}: {
	children: React.ReactNode;
	/** Custom leading visual, takes precedence over `user` and `imageUrl` */
	icon?: React.ReactNode;
	user?: Pick<CommonUser, "id" | "avatar">;
	imageUrl?: string;
	overlayIconUrl?: string;
	subtitle?: React.ReactNode;
	badge?: React.ReactNode;
	badgeVariant?: "default" | "warning";
	suppressSubtitleHydrationWarning?: boolean;
}) {
	return (
		<>
			{icon ? (
				icon
			) : user ? (
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
				<span className={clsx(styles.listLinkTitle, "truncate")}>
					{children}
				</span>
				{subtitle || badge ? (
					<div className={styles.listLinkSubtitleRow}>
						{subtitle ? (
							<span
								className={clsx(styles.listLinkSubtitle, "truncate")}
								suppressHydrationWarning={suppressSubtitleHydrationWarning}
							>
								{subtitle}
							</span>
						) : null}
						{typeof badge === "string" ? (
							<span
								className={clsx(styles.listLinkBadge, {
									[styles.listLinkBadgeWarning]: badgeVariant === "warning",
								})}
							>
								{badge}
							</span>
						) : (
							badge
						)}
					</div>
				) : null}
			</div>
		</>
	);
}
