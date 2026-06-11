import { useFetcher } from "react-router";
import {
	MatchActionPickBanTab,
	type PickBanMapOption,
} from "~/components/match-page/MatchActionPickBanTab";
import { useUser } from "~/features/auth/core/user";
import { useTournament } from "~/features/tournament/routes/to.$id";
import * as PickBan from "~/features/tournament-bracket/core/PickBan";
import type { TournamentDataTeam } from "~/features/tournament-bracket/core/Tournament.server";
import { modesShort } from "~/modules/in-game-lists/modes";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import type { TournamentMatchLoaderData } from "../loaders/to.$id.matches.$mid.server";
import { useMatch } from "../match-page-context";
import { UndoReportButton } from "./TournamentMatchActionTab";

type FromIndicator = NonNullable<PickBanMapOption["picker"]>;

export function TournamentMatchActionPickBanTab({
	data,
	teams,
	turnOfResult,
}: {
	data: TournamentMatchLoaderData;
	teams: [TournamentDataTeam, TournamentDataTeam];
	turnOfResult: PickBan.TurnOfResult;
}) {
	const user = useUser();
	const tournament = useTournament();
	const fetcher = useFetcher();
	const { scoreSum } = useMatch();

	const pickerTeamId = turnOfResult.teamId;
	const pickingTeam = teams.find((team) => team.id === pickerTeamId)!;

	const canPickBan =
		tournament.isOrganizer(user) ||
		tournament.ownedTeamByUser(user)?.id === pickerTeamId;

	const pickBanMapPool = PickBan.mapsListWithLegality({
		toSetMapPool: tournament.ctx.toSetMapPool,
		maps: data.match.roundMaps,
		mapList: data.mapList,
		teams,
		tieBreakerMapPool: tournament.ctx.tieBreakerMapPool,
		pickerTeamId,
		results: data.results,
		pickBanEvents: data.pickBanEvents,
	});

	const isModeAction =
		turnOfResult.action === "MODE_PICK" || turnOfResult.action === "MODE_BAN";
	const isCustomStageBan =
		data.match.roundMaps?.pickBan === "CUSTOM" && turnOfResult.action === "BAN";
	const sharedActionType: "PICK" | "BAN" =
		turnOfResult.action === "PICK" || turnOfResult.action === "MODE_PICK"
			? "PICK"
			: "BAN";

	const teamMemberOfByUser = tournament.teamMemberOfByUser(user);
	const isPartOfTheMatch = teams.some(
		(team) => team.id === teamMemberOfByUser?.id,
	);

	const resolveFrom = (
		stageId: StageId,
		mode?: ModeShort,
	): FromIndicator | undefined => {
		if (!isPartOfTheMatch) return undefined;

		const teamOneHas = teams[0].mapPool?.some(
			(map) => map.stageId === stageId && (!mode || map.mode === mode),
		);
		const teamTwoHas = teams[1].mapPool?.some(
			(map) => map.stageId === stageId && (!mode || map.mode === mode),
		);

		if (teamOneHas && teamTwoHas) return "BOTH";
		if (teamOneHas) {
			return teams[0].id === teamMemberOfByUser?.id ? "US" : "THEM";
		}
		if (teamTwoHas) {
			return teams[1].id === teamMemberOfByUser?.id ? "US" : "THEM";
		}
		return undefined;
	};

	const options = buildPickBanOptions({
		pickBanMapPool,
		mapList: data.mapList,
		isModeAction,
		isCustomStageBan,
		isBan2: data.match.roundMaps?.pickBan === "BAN_2",
		resolveFrom,
	});

	return (
		<MatchActionPickBanTab
			options={options}
			type={sharedActionType}
			isSubmitting={fetcher.state !== "idle"}
			waitingFor={canPickBan ? undefined : pickingTeam.name}
			actionButtons={<UndoReportButton scoreSum={scoreSum} />}
			onSubmit={({ map }) => {
				fetcher.submit(
					{
						_action: "BAN_PICK",
						...(map.mode != null ? { mode: map.mode } : {}),
						...(map.stageId != null ? { stageId: String(map.stageId) } : {}),
					},
					{ method: "post" },
				);
			}}
		/>
	);
}

function buildPickBanOptions({
	pickBanMapPool,
	mapList,
	isModeAction,
	isCustomStageBan,
	isBan2,
	resolveFrom,
}: {
	pickBanMapPool: ReturnType<typeof PickBan.mapsListWithLegality>;
	mapList: TournamentMatchLoaderData["mapList"];
	isModeAction: boolean;
	isCustomStageBan: boolean;
	isBan2: boolean;
	resolveFrom: (
		stageId: StageId,
		mode?: ModeShort,
	) => FromIndicator | undefined;
}): PickBanMapOption[] {
	const legal = pickBanMapPool.filter((map) => map.isLegal);

	if (isModeAction) {
		const seen = new Set<ModeShort>();
		const uniqueModes: PickBanMapOption[] = [];
		for (const { mode } of legal) {
			if (seen.has(mode)) continue;
			seen.add(mode);
			uniqueModes.push({ mode });
		}
		return uniqueModes;
	}

	if (isCustomStageBan) {
		const seen = new Set<StageId>();
		const uniqueStages: PickBanMapOption[] = [];
		for (const { stageId } of legal) {
			if (seen.has(stageId)) continue;
			seen.add(stageId);
			uniqueStages.push({ stageId, picker: resolveFrom(stageId) });
		}
		return uniqueStages.sort((a, b) => a.stageId! - b.stageId!);
	}

	return legal
		.slice()
		.sort((a, b) => {
			const modeDiff = modesShort.indexOf(a.mode) - modesShort.indexOf(b.mode);
			if (modeDiff !== 0) return modeDiff;
			return a.stageId - b.stageId;
		})
		.map((map) => {
			const nth = isBan2
				? (mapList ?? []).findIndex(
						(m) => m.stageId === map.stageId && m.mode === map.mode,
					) + 1
				: undefined;
			return {
				stageId: map.stageId,
				mode: map.mode,
				picker: resolveFrom(map.stageId, map.mode),
				...(nth ? { nth } : {}),
			};
		});
}
