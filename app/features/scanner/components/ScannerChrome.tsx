/**
 * Page chrome shared by the live, VoD and screenshot pages: the controls row
 * with its status pill, the preview/feed split and the file dropzone.
 */

import clsx from "clsx";
import * as React from "react";
import { SendouButton } from "~/components/elements/Button";
import styles from "./ScannerChrome.module.css";

export function ScannerControls({ children }: { children: React.ReactNode }) {
	return <div className={styles.controls}>{children}</div>;
}

export function ScannerStatusPill({
	variant,
	children,
}: {
	variant: "idle" | "watching" | "detected";
	children: React.ReactNode;
}) {
	return (
		<span
			className={clsx(styles.status, {
				[styles.idle]: variant === "idle",
				[styles.watching]: variant === "watching",
				[styles.detected]: variant === "detected",
			})}
		>
			{children}
		</span>
	);
}

export function ScannerSplitLayout({
	style,
	children,
}: {
	style?: React.CSSProperties;
	children: React.ReactNode;
}) {
	return (
		<div className={styles.liveLayout} style={style}>
			{children}
		</div>
	);
}

export function ScannerFeed({ children }: { children: React.ReactNode }) {
	return <div className={styles.feed}>{children}</div>;
}

export function ScannerMenuButton({
	icon,
	label,
}: {
	icon: React.JSX.Element;
	label: string;
}) {
	return (
		<SendouButton icon={icon} className={styles.iconMenu} aria-label={label} />
	);
}

export function ScannerDropzone({
	onFile,
	children,
}: {
	onFile: (file: File) => void;
	children: React.ReactNode;
}) {
	const [over, setOver] = React.useState(false);

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop target; the file input inside is the accessible path
		<div
			className={clsx(styles.dropzone, { [styles.over]: over })}
			onDragOver={(e) => {
				e.preventDefault();
				setOver(true);
			}}
			onDragLeave={() => setOver(false)}
			onDrop={(e) => {
				e.preventDefault();
				setOver(false);
				const file = e.dataTransfer.files[0];
				if (file) onFile(file);
			}}
		>
			{children}
		</div>
	);
}
