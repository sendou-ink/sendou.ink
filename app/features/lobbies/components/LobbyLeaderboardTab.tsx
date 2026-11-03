import * as React from "react";
import { useTranslation } from "react-i18next";
import {
	SendouChipRadio,
	SendouChipRadioGroup,
} from "~/components/elements/ChipRadio";
import { SendouTabPanel } from "~/components/elements/Tabs";
import { WeaponImage } from "~/components/Image";
import { TAB_KEYS } from "~/components/match-page/MatchTabs";
import { useLobbyView } from "../lobbies-hooks";
import { LobbyHeadToHeadGrid } from "./LobbyHeadToHeadGrid";
import styles from "./LobbyLeaderboardTab.module.css";
import { LobbyLeftUserTable, LobbyParticipantTable } from "./LobbyParticipants";
import { LobbyPlayerTable } from "./LobbyPlayerTable";

const WEAPONS_SHOWN = 4;

const VIEWS = ["TABLE", "HEAD_TO_HEAD"] as const;
type View = (typeof VIEWS)[number];

export function LobbyLeaderboardTab() {
	const { t } = useTranslation(["lobbies"]);
	const { data, waitlist } = useLobbyView();
	const [view, setView] = React.useState<View>("TABLE");

	const userOf = (userId: number) =>
		data.lobby.participants.find((participant) => participant.id === userId) ??
		data.sets
			.flatMap((set) => set.participants)
			.find((participant) => participant.id === userId);

	const rows = data.leaderboard.flatMap((row) => {
		const user = userOf(row.userId);
		return user ? [{ ...row, user }] : [];
	});

	const playedRows = rows.filter((row) => row.setWins + row.setLosses > 0);

	return (
		<SendouTabPanel id={TAB_KEYS.LEADERBOARD}>
			<div className={styles.root}>
				<div className={styles.rankings}>
					{playedRows.length > 0 ? (
						<SendouChipRadioGroup aria-label="Rankings view">
							{VIEWS.map((value) => (
								<SendouChipRadio
									key={value}
									name="lobby-rankings-view"
									value={value}
									checked={view === value}
									onChange={() => setView(value)}
								>
									{value === "TABLE"
										? t("lobbies:leaderboard.table")
										: t("lobbies:leaderboard.headToHead")}
								</SendouChipRadio>
							))}
						</SendouChipRadioGroup>
					) : null}
					{view === "HEAD_TO_HEAD" && playedRows.length > 0 ? (
						<LobbyHeadToHeadGrid players={playedRows.map((row) => row.user)} />
					) : (
						<LobbyPlayerTable
							rows={rows}
							isNumbered
							placementOf={(row) => row.placement}
							rowTestId="lobby-leaderboard-row"
							columns={[
								{
									header: t("lobbies:leaderboard.sets"),
									isNumeric: true,
									cell: (row) => `${row.setWins}-${row.setLosses}`,
								},
								{
									header: t("lobbies:leaderboard.maps"),
									isNumeric: true,
									cell: (row) => (
										<>
											{row.mapWins}-{row.mapLosses}
											{row.mapWinPercentage !== null ? (
												<span className="text-lighter">
													{" "}
													({row.mapWinPercentage}%)
												</span>
											) : null}
										</>
									),
								},
								{
									header: t("lobbies:leaderboard.weapons"),
									cell: (row) => (
										<span className={styles.weapons}>
											{row.weaponSplIds
												.slice(0, WEAPONS_SHOWN)
												.map((weaponSplId) => (
													<WeaponImage
														key={weaponSplId}
														weaponSplId={weaponSplId}
														variant="badge"
														size={24}
													/>
												))}
										</span>
									),
								},
							]}
						/>
					)}
				</div>
				<LobbyParticipantTable
					title={t("lobbies:participants.waitlist")}
					participants={waitlist}
					isNumbered
				/>
				<LobbyLeftUserTable />
			</div>
		</SendouTabPanel>
	);
}
