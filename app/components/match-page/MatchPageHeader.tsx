import styles from "./MatchPageHeader.module.css";

export function MatchPageHeader({
	children,
	subtitle,
	topRight,
}: {
	children: React.ReactNode;
	subtitle: string;
	topRight?: React.ReactNode;
}) {
	return (
		<div className={styles.root}>
			<div>
				<h2 className={styles.title}>{children}</h2>
				<div className={styles.subtitle}>{subtitle}</div>
			</div>
			{topRight ? <div>{topRight}</div> : null}
		</div>
	);
}
