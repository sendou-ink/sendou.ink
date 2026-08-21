import { useTranslation } from "react-i18next";
import { Image } from "~/components/Image";
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
import { brandImageUrl, modeImageUrl } from "~/utils/urls";
import { monthYearToSpan } from "../top-search-utils";
import type * as XRankPlacementRepository from "../XRankPlacementRepository.server";
import styles from "./Placements.module.css";

interface PlacementsTableProps {
	placements: Array<XRankPlacementRepository.FindPlacement>;
	type?: "PLAYER_NAME" | "MODE_INFO";
}

const TENTATEK_BRAND_ID = "B10";
const TAKOROKA_BRAND_ID = "B11";

export function PlacementsTable({
	placements,
	type = "PLAYER_NAME",
}: PlacementsTableProps) {
	const { t } = useTranslation(["game-misc"]);

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
									<Image
										alt={
											placement.region === "WEST"
												? "Tentatek Division"
												: "Takoroka Division"
										}
										path={brandImageUrl(
											placement.region === "WEST"
												? TENTATEK_BRAND_ID
												: TAKOROKA_BRAND_ID,
										)}
										width={24}
										height={24}
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
							<div className={styles.time}>
								{monthYearToSpan(placement).from.month}/
								{monthYearToSpan(placement).from.year} -{" "}
								{monthYearToSpan(placement).to.month}/
								{monthYearToSpan(placement).to.year}
							</div>
						) : null}
					</RankTableInnerRow>
					<div>{placement.power.toFixed(1)}</div>
				</RankTableRow>
			))}
		</RankTable>
	);
}
