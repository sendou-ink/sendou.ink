import clsx from "clsx";
import type * as React from "react";
import styles from "./FormMessage.module.css";

export function FormMessage({
	children,
	type,
	className,
}: {
	children: React.ReactNode;
	type: "error" | "info";
	className?: string;
}) {
	return (
		<div
			className={clsx(
				{ [styles.info]: type === "info", [styles.error]: type === "error" },
				className,
			)}
		>
			{children}
		</div>
	);
}
