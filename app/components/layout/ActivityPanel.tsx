import clsx from "clsx";
import type * as React from "react";
import styles from "./ActivityPanel.module.css";

/** Content of an `ActivityButton`'s popover. */
export function ActivityPanel({
	className,
	children,
}: {
	className?: string;
	children: React.ReactNode;
}) {
	return <div className={clsx(styles.panel, className)}>{children}</div>;
}

export function ActivityPanelHeader({
	icon,
	title,
	titleClassName,
	subtitle,
	end,
}: {
	icon?: React.ReactNode;
	title: React.ReactNode;
	titleClassName?: string;
	subtitle?: React.ReactNode;
	end?: React.ReactNode;
}) {
	return (
		<div className={styles.header}>
			{icon}
			<div className={styles.titles}>
				<span className={clsx(styles.title, titleClassName)}>{title}</span>
				{subtitle ? <span className={styles.subtitle}>{subtitle}</span> : null}
			</div>
			{end}
		</div>
	);
}

/** The panel's action row, separated from the content above it. */
export function ActivityPanelControls({
	className,
	children,
}: {
	className?: string;
	children: React.ReactNode;
}) {
	return <div className={clsx(styles.controls, className)}>{children}</div>;
}

export function ActivityPanelSection({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<section className={styles.section}>
			<h3 className={styles.sectionTitle}>{title}</h3>
			{children}
		</section>
	);
}
