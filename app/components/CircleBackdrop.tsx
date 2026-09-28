import clsx from "clsx";
import styles from "./CircleBackdrop.module.css";

/**
 * Places a circle behind its content (e.g. a weapon image) so that
 * asymmetric images still read as visually centered. The circle takes the
 * content's layout size (so it lines up with e.g. avatars of the same size)
 * and the content is scaled up visually to overflow its edge.
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
