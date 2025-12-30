import clsx from "clsx";
import styles from "./Divider.module.css";

export function Divider({
	children,
	className,
	smallText,
}: {
	children?: React.ReactNode;
	className?: string;
	smallText?: boolean;
}) {
	return (
		<div
			className={clsx(styles.divider, className, {
				[styles.smallText]: smallText,
			})}
		>
			{children}
		</div>
	);
}
