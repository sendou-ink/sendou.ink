// note: dev only component, not used in production code

import { useTranslation } from "react-i18next";
import { Image } from "~/components/Image";
import { specialWeaponImageUrl } from "~/utils/urls";
import {
	getSpecialsWithRange,
	type SpecialWeaponWithRange,
} from "../core/special-weapon-range";
import styles from "./SpecialRangeVisualization.module.css";

const RANGE_TYPE_COLOR: Record<SpecialWeaponWithRange["rangeType"], string> = {
	projectile: "#8cd4f5",
	radius: "#f5b8d0",
};

export function SpecialRangeVisualization() {
	const { t } = useTranslation(["weapons"]);

	const specials = getSpecialsWithRange();
	if (specials.length === 0) {
		return null;
	}

	const maxRange = Math.max(
		...specials.map((special) => special.range + (special.blastRadius ?? 0)),
	);

	return (
		<div className={styles.container} data-testid="special-range-visualization">
			<div className={styles.legend}>
				<div className={styles.legendItem}>
					<span
						className={styles.legendSwatch}
						style={{ backgroundColor: RANGE_TYPE_COLOR.projectile }}
					/>
					projectile
				</div>
				<div className={styles.legendItem}>
					<span
						className={styles.legendSwatch}
						style={{ backgroundColor: RANGE_TYPE_COLOR.radius }}
					/>
					radius
				</div>
			</div>
			{specials.map((special) => {
				const color = RANGE_TYPE_COLOR[special.rangeType];
				const rangeWidth = (special.range / maxRange) * 100;
				const blastWidth = special.blastRadius
					? (special.blastRadius / maxRange) * 100
					: 0;

				return (
					<div key={special.specialWeaponId} className={styles.row}>
						<Image
							path={specialWeaponImageUrl(special.specialWeaponId)}
							width={28}
							height={28}
							alt={t(`weapons:SPECIAL_${special.specialWeaponId}`)}
							title={t(`weapons:SPECIAL_${special.specialWeaponId}`)}
						/>
						<div className={styles.track}>
							{blastWidth > 0 ? (
								<span
									className={styles.blast}
									style={{
										insetInlineStart: `${rangeWidth}%`,
										width: `${blastWidth}%`,
										backgroundColor: color,
									}}
								/>
							) : null}
							<span
								className={styles.bar}
								style={{ width: `${rangeWidth}%`, backgroundColor: color }}
							/>
						</div>
						<span className={styles.range}>{special.range.toFixed(1)}</span>
					</div>
				);
			})}
		</div>
	);
}
