import type * as React from "react";
import { navIconUrl } from "~/utils/urls";
import styles from "./EmptyState.module.css";
import { Image } from "./Image";

interface EmptyStateProps {
	/** Name of a nav icon (see nav-items.ts) shown faded above the text */
	navItem: string;
	children: React.ReactNode;
}

/** Renders the message shown by a page or tab that has no content, with the feature's nav icon above it. */
export function EmptyState({ navItem, children }: EmptyStateProps) {
	return (
		<div className={styles.container}>
			<Image
				alt=""
				className={styles.icon}
				containerClassName={styles.iconContainer}
				path={navIconUrl(navItem)}
			/>
			<div className={styles.text}>{children}</div>
		</div>
	);
}
