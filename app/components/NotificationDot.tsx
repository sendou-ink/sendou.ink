import clsx from "clsx";
import styles from "./NotificationDot.module.css";

export function NotificationDot({ className }: { className?: string }) {
	return (
		<span className={clsx(styles.dot, className)}>
			<span className={styles.pulse} />
		</span>
	);
}
