import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Image, WeaponImage } from "~/components/Image";
import {
	brandImageUrl,
	modeImageUrl,
	topSearchPage,
	topSearchPlayerPage,
} from "~/utils/urls";
import styles from "../top-search.module.css";
import { monthYearToSpan } from "../top-search-utils";
import type * as XRankPlacementRepository from "../XRankPlacementRepository.server";

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
		<div className={styles.table}>
			{placements.map((placement, i) => (
				<Link
					to={
						type === "MODE_INFO"
							? topSearchPage(placement)
							: topSearchPlayerPage(placement.playerId)
					}
					key={placement.id}
					className={styles.tableRow}
					data-testid={`placement-row-${i}`}
				>
					<div className={styles.tableInnerRow}>
						<div className={styles.tableRank}>{placement.rank}</div>
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
									/>
								</div>

								<div className={styles.tableMode}>
									<Image
										alt={t(`game-misc:MODE_LONG_${placement.mode}`)}
										path={modeImageUrl(placement.mode)}
										width={24}
									/>
								</div>
							</>
						) : null}
						<WeaponImage
							className={styles.tableWeapon}
							variant="build"
							weaponSplId={placement.weaponSplId}
							width={32}
							height={32}
						/>
						{type === "PLAYER_NAME" ? <div>{placement.name}</div> : null}
						{type === "MODE_INFO" ? (
							<div className={styles.time}>
								{monthYearToSpan(placement).from.month}/
								{monthYearToSpan(placement).from.year} -{" "}
								{monthYearToSpan(placement).to.month}/
								{monthYearToSpan(placement).to.year}
							</div>
						) : null}
					</div>
					<div>{placement.power.toFixed(1)}</div>
				</Link>
			))}
		</div>
	);
}
