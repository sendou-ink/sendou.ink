import clsx from "clsx";
import type * as React from "react";
import styles from "./FormMessage.module.css";

export function FormMessage({
	children,
	type,
	className,
	spaced = true,
	id,
}: {
	children: React.ReactNode;
	type: "error" | "info";
	className?: string;
	spaced?: boolean;
	id?: string;
}) {
	return (
		<div
			id={id}
			className={clsx(
				{ [styles.info]: type === "info", [styles.error]: type === "error" },
				{ [styles.noMargin]: !spaced },
				className,
			)}
		>
			{children}
		</div>
	);
}

/** Field-level error below an input. */
export function SendouFieldError({
	children,
	id,
}: {
	children?: React.ReactNode;
	id?: string;
}) {
	if (!children) return null;

	return (
		<span className={styles.error} id={id}>
			{children}
		</span>
	);
}

/** Field-level hint below an input. */
export function SendouFieldMessage({
	children,
}: {
	children: React.ReactNode;
}) {
	return <span className={styles.info}>{children}</span>;
}
