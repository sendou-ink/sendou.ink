import clsx from "clsx";
import type * as React from "react";
import { Trophy } from "./Trophy";
import styles from "./TrophyShowcase.module.css";

export function TrophyShowcase({
	model,
	children,
	className,
	detailsClassName,
}: {
	model: string;
	children: React.ReactNode;
	className?: string;
	detailsClassName?: string;
}) {
	return (
		<div className={styles.wrapper}>
			<div className={clsx(styles.content, className)}>
				<Trophy model={model} />
				<div className={clsx(styles.details, detailsClassName, "scrollbar")}>
					{children}
				</div>
			</div>
		</div>
	);
}
