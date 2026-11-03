import clsx from "clsx";
import type * as React from "react";
import styles from "./SiteLogoMark.module.css";

/** The "S ink" sendou.ink logo, sized by its font-size */
export function SiteLogoMark({
	className,
	style,
}: {
	className?: string;
	style?: React.CSSProperties;
}) {
	return (
		<div className={clsx(styles.logo, className)} style={style}>
			<span className={styles.logoS}>S</span>
			<span className={styles.logoInk}>ink</span>
		</div>
	);
}
