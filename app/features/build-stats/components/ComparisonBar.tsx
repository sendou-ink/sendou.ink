import { useTranslation } from "react-i18next";
import styles from "./ComparisonBar.module.css";

/** Bar filled up to the weapon's value with a marker at all weapons' value, both given as a percentage of the bar. */
export function ComparisonBar({
	value,
	comparisonValue,
	label,
	size = "medium",
}: {
	value: number;
	comparisonValue: number;
	label: string;
	size?: "small" | "medium";
}) {
	return (
		<div role="img" aria-label={label} className={styles.bar} data-size={size}>
			<div
				className={styles.fill}
				style={{ width: `${Math.min(value, 100)}%` }}
			/>
			<div
				className={styles.marker}
				style={{ insetInlineStart: `${Math.min(comparisonValue, 100)}%` }}
			/>
		</div>
	);
}

/** Explains the colors of `<ComparisonBar />`. */
export function ComparisonBarLegend({ weaponName }: { weaponName: string }) {
	const { t } = useTranslation(["builds"]);

	return (
		<div className="stack horizontal md flex-wrap text-xs text-lighter">
			<span className="stack horizontal xs items-center">
				<span className={styles.fillSwatch} />
				{weaponName}
			</span>
			<span className="stack horizontal xs items-center">
				<span className={styles.markerSwatch} />
				{t("builds:stats.allWeapons")}
			</span>
		</div>
	);
}
