import styles from "./PageHeader.module.css";

/** Page title row: optional leading image, title with an optional subtitle below and on the right a back link (`<BackLink />`) with optional actions under it. */
export function PageHeader({
	image,
	title,
	subtitle,
	back,
	children,
}: {
	image?: React.ReactNode;
	title: React.ReactNode;
	subtitle?: React.ReactNode;
	back?: React.ReactNode;
	/** Actions shown under the back link, or on their own row on narrow screens */
	children?: React.ReactNode;
}) {
	return (
		<header className={styles.pageHeader}>
			<div className={styles.grid}>
				<div className={styles.heading}>
					{image}
					<div className={styles.titles}>
						<h1 className={styles.title}>{title}</h1>
						{subtitle ? (
							<div className={styles.subtitle}>{subtitle}</div>
						) : null}
					</div>
				</div>
				{back ? <div className={styles.back}>{back}</div> : null}
				{children ? <div className={styles.actions}>{children}</div> : null}
			</div>
		</header>
	);
}
