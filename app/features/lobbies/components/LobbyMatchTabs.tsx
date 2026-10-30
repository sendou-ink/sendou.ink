import * as React from "react";
import { useTranslation } from "react-i18next";
import { MatchRosterTab } from "~/components/match-page/MatchRosterTab";
import { MatchTabs, TAB_KEYS } from "~/components/match-page/MatchTabs";
import { matchPageSearchParams } from "~/components/match-page/match-page-search-params";
import { useIsomorphicLayoutEffect } from "~/hooks/useIsomorphicLayoutEffect";
import { useSearchParam } from "~/modules/search-params/hooks";
import * as LobbySet from "../core/LobbySet";
import type { LobbySide } from "../lobbies-constants";
import { useLobbyView } from "../lobbies-hooks";
import { LobbyActionTab } from "./LobbyActionTab";
import { LobbyLeaderboardTab } from "./LobbyLeaderboardTab";
import { LobbyResultTab } from "./LobbyResultTab";
import { LobbyRolledWeapons } from "./LobbyRolledWeapons";

type TabKey = (typeof TAB_KEYS)[keyof typeof TAB_KEYS];

export function LobbyMatchTabs() {
	const { t } = useTranslation(["lobbies"]);
	const { data, currentSet, viewerSide } = useLobbyView();
	useShowRostersOnNewSet(currentSet?.id ?? null);

	const isPlaying =
		data.lobby.endedAt === null &&
		currentSet !== null &&
		viewerSide !== null &&
		!LobbySet.isFinished(currentSet);
	const hasPlayedSets = data.sets.some(
		(set) =>
			set.forfeitingSide !== null ||
			set.games.some((game) => game.winnerSide !== null),
	);
	const viewerMustConfirm =
		isPlaying &&
		data.viewer !== null &&
		LobbySet.canConfirm(currentSet, data.viewer.id);

	const isSetOngoing = currentSet !== null && !LobbySet.isFinished(currentSet);

	const tabs: TabKey[] = [];
	if (isSetOngoing) tabs.push(TAB_KEYS.ROSTERS);
	if (isPlaying) tabs.push(TAB_KEYS.ACTION);
	if (hasPlayedSets) tabs.push(TAB_KEYS.RESULT);
	if (data.leaderboard.length > 0) tabs.push(TAB_KEYS.LEADERBOARD);

	if (tabs.length === 0) return null;

	const roster = (side: "ALPHA" | "BRAVO") =>
		(currentSet?.participants ?? [])
			.filter((participant) => participant.side === side)
			.map((participant) => {
				const lobbyParticipant = data.lobby.participants.find(
					(p) => p.id === participant.id,
				);

				return {
					...participant,
					weaponPool: lobbyParticipant?.weaponPool,
					leaving: lobbyParticipant?.isDroppingAfterSet
						? {
								label: t("lobbies:rosters.leavingAfterSet"),
								explanation: t("lobbies:rosters.leavingAfterSet.explanation", {
									name: participant.username,
								}),
							}
						: undefined,
				};
			});

	const rolledWeapons = (side: LobbySide) =>
		currentSet?.rolledWeapons ? (
			<LobbyRolledWeapons
				weapons={currentSet.rolledWeapons[side]}
				isOwnTeam={viewerSide ? viewerSide === side : null}
			/>
		) : undefined;

	return (
		<MatchTabs
			tabs={tabs}
			alertTabs={viewerMustConfirm ? [TAB_KEYS.ACTION] : undefined}
			defaultTab={isPlaying ? TAB_KEYS.ACTION : undefined}
		>
			{isSetOngoing ? (
				<MatchRosterTab
					minMembersPerTeam={4}
					teams={[
						{
							defaultName: t("lobbies:side.ALPHA"),
							members: roster("ALPHA"),
							headerAside: rolledWeapons("ALPHA"),
						},
						{
							defaultName: t("lobbies:side.BRAVO"),
							members: roster("BRAVO"),
							headerAside: rolledWeapons("BRAVO"),
						},
					]}
				/>
			) : null}
			{isPlaying ? <LobbyActionTab /> : null}
			{hasPlayedSets ? <LobbyResultTab /> : null}
			{data.leaderboard.length > 0 ? <LobbyLeaderboardTab /> : null}
		</MatchTabs>
	);
}

function useShowRostersOnNewSet(currentSetId: number | null) {
	const [, setTab] = useSearchParam(matchPageSearchParams, "tab");
	const previousSetIdRef = React.useRef(currentSetId);

	useIsomorphicLayoutEffect(() => {
		if (previousSetIdRef.current === currentSetId) return;

		previousSetIdRef.current = currentSetId;
		setTab(TAB_KEYS.ROSTERS);
	}, [currentSetId, setTab]);
}
