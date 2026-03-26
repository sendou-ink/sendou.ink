import styles from "./Table.module.css";

export function Table({ children }: { children: React.ReactNode }) {
	return (
		<div className={styles.container}>
			<table className={styles.table}>{children}</table>
		</div>
	);
}
