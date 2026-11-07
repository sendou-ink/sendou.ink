import type React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { ModeImage } from "~/components/Image";
import { LocaleTime } from "~/components/LocaleTime";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import { mapsPageWithMapPool } from "~/features/map-list-generator/map-list-generator-urls";
import type { ModeWithStage } from "~/modules/in-game-lists/types";
import { tournamentRulesPage } from "~/utils/urls";
import { useLobbyView } from "../lobbies-hooks";
import styles from "./LobbyDetails.module.css";

/** The lobby's settings and the host's description of it. */
export function LobbyDetails() {
	const { t } = useTranslation(["lobbies"]);
	const { data } = useLobbyView();
	const { lobby } = data;

	return (
		<div className={styles.root} data-testid="lobby-details">
			<div className={styles.infoRow}>
				<DetailsItem label={t("lobbies:card.start")}>
					<LocaleTime
						inline
						date={lobby.startsAt}
						options={{
							weekday: "short",
							month: "short",
							day: "numeric",
							hour: "numeric",
							minute: "numeric",
						}}
					/>
				</DetailsItem>
				<DetailsItem label={t("lobbies:details.bestOf")}>
					Bo{lobby.bestOf}
				</DetailsItem>
				<DetailsItem label={t("lobbies:details.modes")}>
					{lobby.modes.map((mode) => (
						<ModeImage key={mode} mode={mode} size={20} />
					))}
				</DetailsItem>
				{lobby.mapPool ? (
					<DetailsItem label={t("lobbies:details.mapPool")}>
						<MapPoolLink
							mapPool={lobby.mapPool}
							tournament={
								lobby.mapsTournamentId && lobby.mapsTournamentName
									? {
											id: lobby.mapsTournamentId,
											name: lobby.mapsTournamentName,
										}
									: null
							}
						/>
					</DetailsItem>
				) : null}
				<DetailsItem label={t("lobbies:details.roomSize")}>
					{lobby.roomSize}
				</DetailsItem>
				{lobby.weaponRandomizer !== "OFF" ? (
					<DetailsItem label={t("lobbies:details.weaponRandomizer")}>
						<span data-testid="lobby-weapon-randomizer">
							{t(`lobbies:weaponRandomizer.${lobby.weaponRandomizer}`)}
						</span>
					</DetailsItem>
				) : null}
				{lobby.isApplicationRequired ? (
					<DetailsItem label={t("lobbies:details.joining")}>
						<span data-testid="lobby-application-required">
							{t("lobbies:details.joining.application")}
						</span>
					</DetailsItem>
				) : null}
			</div>
			{lobby.description ? (
				<p className={styles.description} data-testid="lobby-description">
					{lobby.description}
				</p>
			) : null}
		</div>
	);
}

/** The tournament's rules page, where its map pool shows, or the map list generator with the custom pool. */
function MapPoolLink({
	mapPool,
	tournament,
}: {
	mapPool: ModeWithStage[];
	tournament: { id: number; name: string } | null;
}) {
	const { t } = useTranslation(["lobbies"]);

	return (
		<Link
			to={
				tournament
					? tournamentRulesPage(tournament.id)
					: mapsPageWithMapPool(new MapPool(mapPool))
			}
			data-testid="lobby-map-pool-link"
		>
			{tournament?.name ??
				t("lobbies:details.mapPoolCount", { count: mapPool.length })}
		</Link>
	);
}

function DetailsItem({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className={styles.infoItem}>
			<div className={styles.infoLabel}>{label}</div>
			<div className={styles.infoValue}>{children}</div>
		</div>
	);
}
