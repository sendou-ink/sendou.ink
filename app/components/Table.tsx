import clsx from "clsx";
import styles from "./Table.module.css";

export function Table({
	children,
	noRowHover,
}: {
	children: React.ReactNode;
	noRowHover?: boolean;
}) {
	return (
		<div className={styles.container}>
			<table
				className={clsx(styles.table, { [styles.noRowHover]: noRowHover })}
			>
				{children}
			</table>
		</div>
	);
}
