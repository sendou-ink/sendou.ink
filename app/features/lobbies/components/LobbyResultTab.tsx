import * as React from "react";
import { useTranslation } from "react-i18next";
import {
	SendouChipRadio,
	SendouChipRadioGroup,
} from "~/components/elements/ChipRadio";
import { SendouTabPanel } from "~/components/elements/Tabs";
import {
	resolveTimelineScoreboard,
	resolveTimelineWeapons,
} from "~/components/match-page/ingested-scoreboard";
import { TAB_KEYS } from "~/components/match-page/MatchTabs";
import {
	MatchTimeline,
	type TimelineMap,
} from "~/components/match-page/MatchTimeline";
import { databaseTimestampToJavascriptTimestamp } from "~/utils/dates";
import * as LobbySet from "../core/LobbySet";
import { LOBBY_SIDE_TEAM_ID, type LobbySide } from "../lobbies-constants";
import { type LobbySetData, useLobbyView } from "../lobbies-hooks";
import { usersOf } from "./LobbyMatchBanner";
import styles from "./LobbyResultTab.module.css";

/** Timeline of the latest played set, earlier sets selectable. */
export function LobbyResultTab() {
	const { t } = useTranslation(["lobbies"]);
	const { data } = useLobbyView();
	const [selectedSetId, setSelectedSetId] = React.useState<number | null>(null);

	const playedSets = data.sets
		.map((set, i) => ({ set, number: i + 1 }))
		.filter(({ set }) => set.games.some((game) => game.winnerSide !== null))
		.toReversed();
	const selected =
		playedSets.find(({ set }) => set.id === selectedSetId) ?? playedSets[0];

	return (
		<SendouTabPanel id={TAB_KEYS.RESULT}>
			<div className={styles.sets}>
				{playedSets.length > 1 ? (
					<SendouChipRadioGroup wrap>
						{playedSets.map(({ set, number }) => (
							<SendouChipRadio
								key={set.id}
								name="lobby-set"
								value={String(set.id)}
								checked={set.id === selected?.set.id}
								onChange={() => setSelectedSetId(set.id)}
							>
								{t("lobbies:result.set", { number })}
							</SendouChipRadio>
						))}
					</SendouChipRadioGroup>
				) : null}
				{selected ? <SetTimeline set={selected.set} /> : null}
			</div>
		</SendouTabPanel>
	);
}

function SetTimeline({ set }: { set: LobbySetData }) {
	const { t } = useTranslation(["lobbies"]);
	const { data } = useLobbyView();
	const { alpha, bravo } = LobbySet.score(set);

	return (
		<MatchTimeline
			teams={{
				alpha: { name: t("lobbies:side.ALPHA") },
				bravo: { name: t("lobbies:side.BRAVO") },
			}}
			score={{ alpha, bravo }}
			isOngoing={!LobbySet.isFinished(set) && data.lobby.endedAt === null}
			maps={timelineMaps({
				set,
				reportedWeapons: data.reportedWeapons,
				ingestedScoreboards: data.ingestedScoreboards,
			})}
		/>
	);
}

function timelineMaps({
	set,
	reportedWeapons,
	ingestedScoreboards,
}: {
	set: LobbySetData;
	reportedWeapons: ReturnType<typeof useLobbyView>["data"]["reportedWeapons"];
	ingestedScoreboards: ReturnType<
		typeof useLobbyView
	>["data"]["ingestedScoreboards"];
}): TimelineMap[] {
	const rosters = {
		alpha: usersOf(set, "ALPHA"),
		bravo: usersOf(set, "BRAVO"),
	};

	return set.games.flatMap((game) => {
		if (!game.winnerSide || !game.reportedAt) return [];

		const scoreboard = ingestedScoreboards.find(
			(candidate) =>
				candidate.lobbySetId === set.id && candidate.mapIndex === game.index,
		);
		const weaponsOf = (side: LobbySide) =>
			resolveTimelineWeapons({
				linkedWeapons: rosters[side === "ALPHA" ? "alpha" : "bravo"].map(
					(player) =>
						reportedWeapons.find(
							(weapon) =>
								weapon.lobbySetId === set.id &&
								weapon.mapIndex === game.index &&
								weapon.userId === player.id,
						)?.weaponSplId ?? null,
				),
				ingestedPlayers: scoreboard?.data.players ?? [],
				tournamentTeamId: LOBBY_SIDE_TEAM_ID[side],
			});

		return [
			{
				stageId: game.stageId,
				mode: game.mode,
				timestamp: databaseTimestampToJavascriptTimestamp(game.reportedAt),
				winner: game.winnerSide,
				rosters,
				weapons: { alpha: weaponsOf("ALPHA"), bravo: weaponsOf("BRAVO") },
				scoreboard: resolveTimelineScoreboard(
					scoreboard?.data,
					game.winnerSide === "ALPHA",
				),
			},
		];
	});
}
