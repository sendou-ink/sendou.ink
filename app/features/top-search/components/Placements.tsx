import { useTranslation } from "react-i18next";
import { Image } from "~/components/Image";
import { LocaleTimeRange } from "~/components/LocaleTimeRange";
import {
	RankTable,
	RankTableInnerRow,
	RankTableRank,
	RankTableRow,
	RankTableWeaponImage,
} from "~/components/RankTable";
import {
	topSearchPage,
	topSearchPlayerPage,
} from "~/features/top-search/top-search-urls";
import { modeImageUrl } from "~/utils/urls";
import { monthYearToSpan } from "../top-search-utils";
import type * as XRankPlacementRepository from "../XRankPlacementRepository.server";
import { DivisionImage } from "./DivisionImage";
import styles from "./Placements.module.css";

interface PlacementsTableProps {
	placements: Array<XRankPlacementRepository.FindPlacement>;
	type?: "PLAYER_NAME" | "MODE_INFO";
}

export function PlacementsTable({
	placements,
	type = "PLAYER_NAME",
}: PlacementsTableProps) {
	const { t } = useTranslation(["game-misc", "common"]);

	return (
		<RankTable>
			{placements.map((placement, i) => (
				<RankTableRow
					to={
						type === "MODE_INFO"
							? topSearchPage(placement)
							: topSearchPlayerPage(placement.playerId)
					}
					key={placement.id}
					testId={`placement-row-${i}`}
				>
					<RankTableInnerRow>
						<RankTableRank>{placement.rank}</RankTableRank>
						{type === "MODE_INFO" ? (
							<>
								<div className={styles.tableMode}>
									<DivisionImage
										region={placement.region}
										alt={t(`common:divisions.${placement.region}`)}
										size={24}
									/>
								</div>

								<div className={styles.tableMode}>
									<Image
										alt={t(`game-misc:MODE_LONG_${placement.mode}`)}
										path={modeImageUrl(placement.mode)}
										width={24}
										height={24}
									/>
								</div>
							</>
						) : null}
						<RankTableWeaponImage weaponSplId={placement.weaponSplId} />
						{type === "PLAYER_NAME" ? <div>{placement.name}</div> : null}
						{type === "MODE_INFO" ? (
							<PlacementSeasonSpan
								placement={placement}
								className={styles.time}
							/>
						) : null}
					</RankTableInnerRow>
					<div className={styles.power}>{placement.power.toFixed(1)}</div>
				</RankTableRow>
			))}
		</RankTable>
	);
}

function PlacementSeasonSpan({
	placement,
	className,
}: {
	placement: XRankPlacementRepository.FindPlacement;
	className: string;
}) {
	const span = monthYearToSpan(placement);

	return (
		<LocaleTimeRange
			from={span.from}
			to={span.to}
			options={{ month: "numeric", year: "numeric" }}
			className={className}
		/>
	);
}
