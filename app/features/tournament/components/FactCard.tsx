import type * as React from "react";
import styles from "./FactCard.module.css";

export interface FactCardItem {
	label: string;
	value: React.ReactNode;
}

export function FactCardGrid({ facts }: { facts: FactCardItem[] }) {
	const leftFacts = facts.filter((_, i) => i % 2 === 0);
	const rightFacts = facts.filter((_, i) => i % 2 === 1);

	return (
		<div className={styles.wrapper}>
			<div className={styles.column}>
				{leftFacts.map((fact) => (
					<Card key={fact.label} {...fact} />
				))}
			</div>
			{rightFacts.length > 0 ? (
				<>
					<div className={styles.divider} aria-hidden="true" />
					<div className={styles.column}>
						{rightFacts.map((fact) => (
							<Card key={fact.label} {...fact} />
						))}
					</div>
				</>
			) : null}
		</div>
	);
}

function Card({ label, value }: FactCardItem) {
	return (
		<div className={styles.card}>
			<div className={styles.label}>{label}</div>
			<div className={styles.value}>{value}</div>
		</div>
	);
}
