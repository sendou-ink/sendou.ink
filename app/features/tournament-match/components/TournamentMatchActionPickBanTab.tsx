import {
	MatchActionPickBanTab,
	type PickBanMapOption,
} from "~/components/match-page/MatchActionPickBanTab";
import { useUser } from "~/features/auth/core/user";
import { useTournament } from "~/features/tournament/tournament-context";
import * as PickBan from "~/features/tournament-bracket/core/PickBan";
import { matchSchema } from "~/features/tournament-bracket/tournament-bracket-schemas";
import { useActionSubmit } from "~/hooks/useActionSubmit";
import { modesShort } from "~/modules/in-game-lists/modes";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import type { TournamentMatchLoaderData } from "../loaders/to.$id.matches.$mid.server";
import { type MatchPageTeam, useMatch } from "../match-page-context";
import { UndoReportButton } from "./TournamentMatchActionTab";

type FromIndicator = NonNullable<PickBanMapOption["picker"]>;

export function TournamentMatchActionPickBanTab({
	data,
	teams,
	turnOfResult,
}: {
	data: TournamentMatchLoaderData;
	teams: [MatchPageTeam, MatchPageTeam];
	turnOfResult: PickBan.TurnOfResult;
}) {
	const user = useUser();
	const tournament = useTournament();
	const banPick = useActionSubmit(matchSchema);
	const { scoreSum } = useMatch();

	const pickerTeamId = turnOfResult.teamId;
	const pickingTeam = teams.find((team) => team.id === pickerTeamId)!;

	const canPickBan =
		tournament.isOrganizer(user) ||
		(user ? pickingTeam.memberUserIds.includes(user.id) : false);

	const pickBanMapPool = PickBan.mapsListWithLegality({
		toSetMapPool: tournament.organizerPickedMapPool,
		maps: data.match.roundMaps,
		mapList: data.mapList,
		teams,
		pickerTeamId,
		results: data.results,
		pickBanEvents: data.pickBanEvents,
	});

	const isModeAction =
		turnOfResult.action === "MODE_PICK" || turnOfResult.action === "MODE_BAN";
	const isCustomStageBan =
		data.match.roundMaps?.pickBan === "CUSTOM" && turnOfResult.action === "BAN";
	const sharedActionType: "PICK" | "BAN" =
		turnOfResult.action === "PICK" ||
		turnOfResult.action === "PICK_NO_MODE_REPEAT" ||
		turnOfResult.action === "MODE_PICK"
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
		isModeAction,
		isCustomStageBan,
		isBan2: data.match.roundMaps?.pickBan === "BAN_2",
		resolveFrom,
	});

	return (
		<MatchActionPickBanTab
			options={options}
			type={sharedActionType}
			isSubmitting={banPick.state !== "idle"}
			waitingFor={canPickBan ? undefined : pickingTeam.name}
			actionButtons={<UndoReportButton scoreSum={scoreSum} />}
			onSubmit={({ map }) => {
				banPick.submit("BAN_PICK", {
					mode: map.mode ?? undefined,
					stageId: map.stageId ?? undefined,
					mapListIndex: map.nth !== undefined ? map.nth - 1 : undefined,
				});
			}}
		/>
	);
}

function buildPickBanOptions({
	pickBanMapPool,
	isModeAction,
	isCustomStageBan,
	isBan2,
	resolveFrom,
}: {
	pickBanMapPool: ReturnType<typeof PickBan.mapsListWithLegality>;
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
		return uniqueModes.sort(
			(a, b) => modesShort.indexOf(a.mode!) - modesShort.indexOf(b.mode!),
		);
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

	return pickBanMapPool
		.map((map, mapListIndex) => ({
			map,
			// a BAN_2 round's pool is its map list
			nth: isBan2 ? mapListIndex + 1 : undefined,
		}))
		.filter(({ map }) => map.isLegal)
		.sort((a, b) => {
			const modeDiff =
				modesShort.indexOf(a.map.mode) - modesShort.indexOf(b.map.mode);
			if (modeDiff !== 0) return modeDiff;
			return a.map.stageId - b.map.stageId || (a.nth ?? 0) - (b.nth ?? 0);
		})
		.map(({ map, nth }) => ({
			stageId: map.stageId,
			mode: map.mode,
			picker: resolveFrom(map.stageId, map.mode),
			...(nth ? { nth } : {}),
		}));
}
