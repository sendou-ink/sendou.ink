import clsx from "clsx";
import styles from "./NotificationDot.module.css";

export function NotificationDot({ className }: { className?: string }) {
	return (
		<span className={clsx(styles.dotWrapper, className)}>
			<span className={styles.pulse} />
			<span className={styles.dot} />
		</span>
	);
}
