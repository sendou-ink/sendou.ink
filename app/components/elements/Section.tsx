import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import styles from "./Section.module.css";

/** Card-like container used to group related content, with an optional header row of title, action and icon. */
export function SendouSection({
	title,
	icon: Icon,
	action,
	className,
	children,
}: {
	title?: string;
	icon?: LucideIcon;
	/** Rendered at the end of the header row, e.g. a "Show all" button. Only shown together with `title`. */
	action?: React.ReactNode;
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<section className={clsx(styles.section, className)}>
			{title ? (
				<header className={styles.header}>
					<h2 className={styles.title}>{title}</h2>
					{action ? <div className={styles.action}>{action}</div> : null}
					{Icon ? <Icon className={styles.icon} size={16} /> : null}
				</header>
			) : null}
			{children}
		</section>
	);
}
