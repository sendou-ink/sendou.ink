import clsx from "clsx";
import styles from "./CircleBackdrop.module.css";

/**
 * Places a circle behind its content (e.g. a weapon image) so that
 * asymmetric images still read as visually centered. The circle scales with
 * the content and is slightly smaller than it, so the content overlaps its edge.
 */
export function CircleBackdrop({
	children,
	bordered = false,
	className,
}: {
	children: React.ReactNode;
	bordered?: boolean;
	className?: string;
}) {
	return (
		<div
			className={clsx(styles.circleBackdrop, className, {
				[styles.bordered]: bordered,
			})}
		>
			{children}
		</div>
	);
}
