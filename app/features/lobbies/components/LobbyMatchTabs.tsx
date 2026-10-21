import { useTranslation } from "react-i18next";
import { MatchRosterTab } from "~/components/match-page/MatchRosterTab";
import { MatchTabs, TAB_KEYS } from "~/components/match-page/MatchTabs";
import * as LobbySet from "../core/LobbySet";
import { useLobbyView } from "../lobbies-hooks";
import { LobbyActionTab } from "./LobbyActionTab";
import { LobbyLeaderboardTab } from "./LobbyLeaderboardTab";
import { LobbyResultTab } from "./LobbyResultTab";

type TabKey = (typeof TAB_KEYS)[keyof typeof TAB_KEYS];

export function LobbyMatchTabs() {
	const { t } = useTranslation(["lobbies"]);
	const { data, currentSet, viewerSide } = useLobbyView();

	const isPlaying =
		data.lobby.endedAt === null &&
		currentSet !== null &&
		viewerSide !== null &&
		!LobbySet.isFinished(currentSet);
	const hasReportedMaps = data.sets.some((set) =>
		set.games.some((game) => game.winnerSide !== null),
	);
	const viewerMustConfirm =
		isPlaying &&
		data.viewer !== null &&
		LobbySet.canConfirm(currentSet, data.viewer.id);

	const tabs: TabKey[] = [];
	if (currentSet) tabs.push(TAB_KEYS.ROSTERS);
	if (isPlaying) tabs.push(TAB_KEYS.ACTION);
	if (hasReportedMaps) tabs.push(TAB_KEYS.RESULT);
	if (data.leaderboard.length > 0) tabs.push(TAB_KEYS.LEADERBOARD);

	if (tabs.length === 0) return null;

	const roster = (side: "ALPHA" | "BRAVO") =>
		(currentSet?.participants ?? [])
			.filter((participant) => participant.side === side)
			.map((participant) => ({
				...participant,
				weaponPool: data.lobby.participants.find((p) => p.id === participant.id)
					?.weaponPool,
			}));

	return (
		<MatchTabs
			tabs={tabs}
			alertTabs={viewerMustConfirm ? [TAB_KEYS.ACTION] : undefined}
			defaultTab={isPlaying ? TAB_KEYS.ACTION : undefined}
		>
			{currentSet ? (
				<MatchRosterTab
					minMembersPerTeam={4}
					teams={[
						{ defaultName: t("lobbies:side.ALPHA"), members: roster("ALPHA") },
						{ defaultName: t("lobbies:side.BRAVO"), members: roster("BRAVO") },
					]}
				/>
			) : null}
			{isPlaying ? <LobbyActionTab /> : null}
			{hasReportedMaps ? <LobbyResultTab /> : null}
			{data.leaderboard.length > 0 ? <LobbyLeaderboardTab /> : null}
		</MatchTabs>
	);
}
