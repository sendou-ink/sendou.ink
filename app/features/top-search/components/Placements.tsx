import { Link } from "@remix-run/react";
import { useTranslation } from "react-i18next";
import { Image, WeaponImage } from "~/components/Image";
import {
	brandImageUrl,
	modeImageUrl,
	topSearchPage,
	topSearchPlayerPage,
} from "~/utils/urls";
import type { FindPlacement } from "../queries/findPlacements.server";
import { monthYearToSpan } from "../top-search-utils";

interface PlacementsTableProps {
	placements: Array<FindPlacement>;
	type?: "PLAYER_NAME" | "MODE_INFO";
}

export function PlacementsTable({
	placements,
	type = "PLAYER_NAME",
}: PlacementsTableProps) {
	const { t } = useTranslation(["game-misc"]);

	return (
		<div className="placements__table">
			{placements.map((placement, i) => (
				<Link
					to={
						type === "MODE_INFO"
							? topSearchPage(placement)
							: topSearchPlayerPage(placement.playerId)
					}
					key={placement.id}
					className="placements__table__row"
					data-testid={`placement-row-${i}`}
				>
					<div className="placements__table__inner-row">
						<div className="placements__table__rank">{placement.rank}</div>
						{type === "MODE_INFO" ? (
							<>
								<div className="placements__table__mode">
									<Image
										alt={
											placement.region === "WEST"
												? "Tentatek Division"
												: "Takoroka Division"
										}
										path={brandImageUrl(
											placement.region === "WEST" ? "tentatek" : "takoroka",
										)}
										width={24}
									/>
								</div>

								<div className="placements__table__mode">
									<Image
										alt={t(`game-misc:MODE_LONG_${placement.mode}`)}
										path={modeImageUrl(placement.mode)}
										width={24}
									/>
								</div>
							</>
						) : null}
						<WeaponImage
							className="placements__table__weapon"
							variant="build"
							weaponSplId={placement.weaponSplId}
							width={32}
							height={32}
						/>
						{type === "PLAYER_NAME" ? <div>{placement.name}</div> : null}
						{type === "MODE_INFO" ? (
							<div className="placements__time">
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
