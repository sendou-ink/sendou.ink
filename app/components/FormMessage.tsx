import clsx from "clsx";
import type * as React from "react";
import { FieldError, Text } from "react-aria-components";
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

/** Field-level error, wired to the surrounding React Aria field's validation. */
export function SendouFieldError({
	children,
	id,
}: {
	children?: React.ReactNode;
	id?: string;
}) {
	return (
		<FieldError className={styles.error} id={id}>
			{children}
		</FieldError>
	);
}

/** Field-level hint below an input. */
export function SendouFieldMessage({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<Text slot="description" className={styles.info}>
			{children}
		</Text>
	);
}
