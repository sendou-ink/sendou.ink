import { useTranslation } from "react-i18next";
import { SendouTabPanel } from "~/components/elements/Tabs";
import { WeaponImage } from "~/components/Image";
import { TAB_KEYS } from "~/components/match-page/MatchTabs";
import { useLobbyView } from "../lobbies-hooks";
import styles from "./LobbyLeaderboardTab.module.css";
import { LobbyParticipantTable } from "./LobbyParticipants";
import { LobbyPlayerTable } from "./LobbyPlayerTable";

const WEAPONS_SHOWN = 4;

export function LobbyLeaderboardTab() {
	const { t } = useTranslation(["lobbies"]);
	const { data, waitlist } = useLobbyView();

	const userOf = (userId: number) =>
		data.lobby.participants.find((participant) => participant.id === userId) ??
		data.sets
			.flatMap((set) => set.participants)
			.find((participant) => participant.id === userId);

	const rows = data.leaderboard.flatMap((row) => {
		const user = userOf(row.userId);
		return user ? [{ ...row, user }] : [];
	});

	return (
		<SendouTabPanel id={TAB_KEYS.LEADERBOARD}>
			<div className={styles.root}>
				<LobbyPlayerTable
					rows={rows}
					isNumbered
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
				<LobbyParticipantTable
					title={t("lobbies:participants.waitlist")}
					participants={waitlist}
					isNumbered
				/>
			</div>
		</SendouTabPanel>
	);
}
