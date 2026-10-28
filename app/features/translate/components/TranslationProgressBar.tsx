import styles from "./TranslationProgressBar.module.css";

export function TranslationProgressBar({
	translated,
	total,
}: {
	translated: number;
	total: number;
}) {
	const percentage = total === 0 ? 100 : Math.floor((translated / total) * 100);

	return (
		<div className={styles.container}>
			<progress className={styles.bar} value={translated} max={total} />
			<div className={styles.labels}>
				<span>
					{translated} / {total} translated
				</span>
				<span>{percentage}%</span>
			</div>
		</div>
	);
}
