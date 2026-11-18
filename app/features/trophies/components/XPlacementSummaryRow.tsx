import { clsx } from "clsx";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { ModeImage, WeaponImage } from "~/components/Image";
import { LocaleTimeRange } from "~/components/LocaleTimeRange";
import { DivisionImage } from "~/features/top-search/components/DivisionImage";
import type { XRankPlacementRegion } from "~/features/top-search/top-search-types";
import { topSearchPage } from "~/features/top-search/top-search-urls";
import { monthYearToSpan } from "~/features/top-search/top-search-utils";
import type { MainWeaponId, ModeShort } from "~/modules/in-game-lists/types";
import styles from "./XPlacementSummaryRow.module.css";

export function XPlacementSummaryRow({
	placement,
	className,
}: {
	placement: {
		weaponSplId: MainWeaponId;
		power: number;
		rank: number;
		region: XRankPlacementRegion;
		mode: ModeShort;
		month: number;
		year: number;
	};
	className?: string;
}) {
	const { t } = useTranslation(["common"]);

	const season = monthYearToSpan(placement);
	const divisionName = t(`common:divisions.${placement.region}`);

	return (
		<Link
			to={topSearchPage(placement)}
			className={clsx(styles.row, className)}
			data-testid="trophy-placement"
		>
			<WeaponImage
				weaponSplId={placement.weaponSplId}
				variant="badge"
				width={32}
				height={32}
			/>
			<div className="stack xxs">
				<span className={styles.power}>
					{placement.power.toFixed(1)}
					<span className={styles.rank}>#{placement.rank}</span>
				</span>
				<div className={styles.meta}>
					<span className={styles.metaItem}>
						<DivisionImage
							region={placement.region}
							size={14}
							alt={divisionName}
						/>
						{divisionName}
					</span>
					<ModeImage mode={placement.mode} size={14} />
					<LocaleTimeRange
						from={season.from}
						to={season.to}
						options={{ month: "short", year: "numeric" }}
						inline
					/>
				</div>
			</div>
		</Link>
	);
}
