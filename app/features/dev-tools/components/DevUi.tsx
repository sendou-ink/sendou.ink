import clsx from "clsx";
import { Check, Copy } from "lucide-react";
import * as React from "react";
import { SendouButton } from "~/components/elements/Button";
import styles from "./DevUi.module.css";

/** Small status label, the site has no general purpose one. */
export function DevChip({
	tone = "neutral",
	title,
	children,
}: {
	tone?: "neutral" | "accent" | "success" | "warning" | "error" | "info";
	title?: string;
	children: React.ReactNode;
}) {
	return (
		<span className={clsx(styles.chip, styles[tone])} title={title}>
			{children}
		</span>
	);
}

/** Count overlaid on an app's bar icon. */
export function DevBadge({
	count,
	tone,
}: {
	count: number;
	tone: "warning" | "error";
}) {
	if (count === 0) return null;

	return (
		<span className={clsx(styles.badge, styles[`${tone}Badge`])}>
			{count > 99 ? "99+" : count}
		</span>
	);
}

/** Status dot overlaid on an app's bar icon. */
export function DevStatusDot({
	tone,
	title,
}: {
	tone: "neutral" | "warning" | "success";
	title: string;
}) {
	return (
		<span
			className={clsx(styles.statusDot, styles[`${tone}Dot`])}
			title={title}
		/>
	);
}

export function CopyButton({
	text,
	label = "Copy",
}: {
	text: string;
	label?: string;
}) {
	const [isCopied, setIsCopied] = React.useState(false);

	return (
		<SendouButton
			variant="minimal"
			size="miniscule"
			icon={isCopied ? <Check /> : <Copy />}
			aria-label={label}
			title={label}
			onClick={async () => {
				await navigator.clipboard.writeText(text);
				setIsCopied(true);
				window.setTimeout(() => setIsCopied(false), 1500);
			}}
		/>
	);
}

/** Opens the file in the editor through the Vite dev server's open-in-editor endpoint. */
export function OpenInEditor({
	file,
	children,
}: {
	/** Path from the project root, e.g. `app/root.tsx`. */
	file: string;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			className={styles.fileLink}
			title={`Open ${file} in your editor`}
			onClick={() => {
				void fetch(`/__open-in-editor?file=${encodeURIComponent(file)}`);
			}}
		>
			{children}
		</button>
	);
}

/** A `<details>` whose content only mounts while open. */
export function DevDisclosure({
	summary,
	children,
}: {
	summary: React.ReactNode;
	children: React.ReactNode;
}) {
	const [isOpen, setIsOpen] = React.useState(false);

	return (
		<details
			className={styles.disclosure}
			open={isOpen}
			onToggle={(event) => setIsOpen(event.currentTarget.open)}
		>
			<summary className={styles.disclosureSummary}>{summary}</summary>
			{isOpen ? (
				<div className={styles.disclosureContent}>{children}</div>
			) : null}
		</details>
	);
}
