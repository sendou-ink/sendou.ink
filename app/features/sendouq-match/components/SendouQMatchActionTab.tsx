import { useFetcher } from "react-router";
import { MatchActionTab } from "~/components/match-page/MatchActionTab";
import { SENDOUQ_BEST_OF } from "~/features/sendouq/q-constants";
import { isSetOverByScore } from "~/features/tournament-bracket/tournament-bracket-utils";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import type { SerializeFrom } from "~/utils/remix";
import type { SendouQMatchLoaderData } from "../loaders/q.match.$id.server";

export function SendouQMatchActionTab({
	data,
	currentMap,
	ownTeamId,
	reportedCount,
}: {
	data: SerializeFrom<SendouQMatchLoaderData>;
	currentMap: { stageId: StageId; mode: ModeShort };
	ownTeamId: number;
	reportedCount: number;
}) {
	const fetcher = useFetcher();

	const alphaScore = data.match.mapList.filter(
		(m) => m.winnerGroupId === data.match.groupAlpha.id,
	).length;
	const bravoScore = data.match.mapList.filter(
		(m) => m.winnerGroupId === data.match.groupBravo.id,
	).length;

	const scores: [number, number] = [alphaScore, bravoScore];

	// xxx: we can improve this
	const setEndingTeamIds: number[] = [];
	if (
		isSetOverByScore({
			scores: [scores[0] + 1, scores[1]],
			count: SENDOUQ_BEST_OF,
			countType: "BEST_OF",
		})
	) {
		setEndingTeamIds.push(data.match.groupAlpha.id);
	}
	if (
		isSetOverByScore({
			scores: [scores[0], scores[1] + 1],
			count: SENDOUQ_BEST_OF,
			countType: "BEST_OF",
		})
	) {
		setEndingTeamIds.push(data.match.groupBravo.id);
	}

	const setEnding =
		setEndingTeamIds.length > 0
			? {
					...buildSendouQSetEndingData({
						match: data.match,
						scores,
					}),
					setEndingTeamIds,
				}
			: undefined;

	return (
		<MatchActionTab
			key={reportedCount}
			teams={[
				{ id: data.match.groupAlpha.id, name: "Group Alpha" },
				{ id: data.match.groupBravo.id, name: "Group Bravo" },
			]}
			ownTeamId={ownTeamId}
			stageId={currentMap.stageId}
			mode={currentMap.mode}
			withPoints={false}
			isSubmitting={fetcher.state !== "idle"}
			setEnding={setEnding}
			onSubmit={(winnerId) => {
				fetcher.submit(
					{
						_action: "REPORT_SCORE",
						winnerId: String(winnerId),
						reportedCount: String(reportedCount),
					},
					{ method: "post" },
				);
			}}
		/>
	);
}

function buildSendouQSetEndingData({
	match,
	scores,
}: {
	match: SerializeFrom<SendouQMatchLoaderData>["match"];
	scores: [number, number];
}) {
	const completedMaps = match.mapList.filter((m) => m.winnerGroupId !== null);

	const previousMaps = completedMaps.map((map) => ({
		stageId: map.stageId,
		mode: map.mode,
		timestamp: Date.now(),
		winner:
			map.winnerGroupId === match.groupAlpha.id
				? ("ALPHA" as const)
				: ("BRAVO" as const),
		rosters: {
			alpha: match.groupAlpha.members,
			bravo: match.groupBravo.members,
		},
	}));

	const alphaTeam = match.groupAlpha.team;
	const bravoTeam = match.groupBravo.team;

	return {
		teams: {
			alpha: {
				name: alphaTeam?.name ?? "Group Alpha",
				avatar: alphaTeam?.avatarUrl ?? undefined,
			},
			bravo: {
				name: bravoTeam?.name ?? "Group Bravo",
				avatar: bravoTeam?.avatarUrl ?? undefined,
			},
		},
		score: { alpha: scores[0], bravo: scores[1] },
		previousMaps,
		currentRosters: {
			alpha: match.groupAlpha.members,
			bravo: match.groupBravo.members,
		},
	};
}
