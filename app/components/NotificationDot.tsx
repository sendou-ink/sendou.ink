import clsx from "clsx";
import styles from "./NotificationDot.module.css";

export function NotificationDot({
	className,
	testId,
}: {
	className?: string;
	testId?: string;
}) {
	return (
		<span className={clsx(styles.dotWrapper, className)} data-testid={testId}>
			<span className={styles.pulse} />
			<span className={styles.dot} />
		</span>
	);
}
