import clsx from "clsx";
import styles from "./MatchPage.module.css";

export function MatchPage({
	children,
	className,
}: {
	children?: React.ReactNode;
	className?: string;
}) {
	return <div className={clsx(styles.root, className)}>{children}</div>;
}
