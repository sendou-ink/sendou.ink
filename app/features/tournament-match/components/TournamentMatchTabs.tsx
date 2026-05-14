import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { MatchJoinTab } from "~/components/match-page/MatchJoinTab";
import { MatchResultTab } from "~/components/match-page/MatchResultTab";
import { MatchRosterTab } from "~/components/match-page/MatchRosterTab";
import { MatchTabs, TAB_KEYS } from "~/components/match-page/MatchTabs";
import type {
	TimelineMap,
	TimelinePickBanEvent,
} from "~/components/match-page/MatchTimeline";
import { resolveRoomPass } from "~/components/match-page/utils";
import { useUser } from "~/features/auth/core/user";
import { useConfirmRoom } from "~/features/chat/room-link-utils";
import { useTournament } from "~/features/tournament/routes/to.$id";
import * as PickBan from "~/features/tournament-bracket/core/PickBan";
import { tournamentTeamToActiveRosterUserIds } from "~/features/tournament-bracket/tournament-bracket-utils";
import { databaseTimestampToJavascriptTimestamp } from "~/utils/dates";
import { tournamentTeamPage } from "~/utils/urls";
import type { TournamentMatchLoaderData } from "../loaders/to.$id.matches.$mid.server";
import { type MatchPageTeam, useMatch } from "../match-page-context";
import { resolveHostingTeam } from "../tournament-match-utils";
import { TournamentMatchActionPickBanTab } from "./TournamentMatchActionPickBanTab";
import { TournamentMatchActionTab } from "./TournamentMatchActionTab";
import { TournamentMatchAdminTab } from "./TournamentMatchAdminTab";

export function TournamentMatchTabs({
	data,
}: {
	data: TournamentMatchLoaderData;
}) {
	const tournament = useTournament();
	const user = useUser();
	const {
		teams: [teamOne, teamTwo],
		scores,
		tabs,
		turnOfResult,
		isPickBanStep,
	} = useMatch();

	// When waiting on team(s) only a subset of tabs can be rendered
	if (!teamOne || !teamTwo) {
		return tabs.length > 0 ? (
			<MatchTabs tabs={tabs}>
				{tabs.includes(TAB_KEYS.ROSTERS) ? (
					<TournamentMatchRosterTab data={data} />
				) : null}
				{tabs.includes(TAB_KEYS.ADMIN) ? (
					<TournamentMatchAdminTab data={data} />
				) : null}
			</MatchTabs>
		) : null;
	}

	const opponentOneId = teamOne.id;
	const opponentTwoId = teamTwo.id;
	const pickBanTeams: [MatchPageTeam, MatchPageTeam] = [teamOne, teamTwo];

	const userTournamentTeamId = tournament.teamMemberOfByUser(user)?.id;
	const userTeamId =
		userTournamentTeamId === opponentOneId ||
		userTournamentTeamId === opponentTwoId
			? userTournamentTeamId
			: null;

	const pickBanData = resolveTimelinePickBanData(
		data,
		opponentOneId,
		pickBanTeams,
	);
	const timelineMaps = resolveTimelineMaps(
		data,
		opponentOneId,
		opponentTwoId,
	).map((m, i) => ({ ...m, pickedBy: pickBanData?.pickedBySlot.get(i) }));

	return (
		<MatchTabs tabs={tabs}>
			{tabs.includes(TAB_KEYS.RESULT) ? (
				<MatchResultTab
					teams={resolveTimelineTeams(opponentOneId, opponentTwoId, tournament)}
					score={{
						alpha: scores[0],
						bravo: scores[1],
					}}
					maps={timelineMaps}
					pickBanRowsBySlot={pickBanData?.rowsBySlot}
					isOngoing={!data.matchIsOver && data.results.length > 0}
				/>
			) : null}
			{tabs.includes(TAB_KEYS.JOIN) ? (
				<TournamentMatchJoinTab data={data} />
			) : null}
			<TournamentMatchRosterTab data={data} />
			{tabs.includes(TAB_KEYS.ACTION) ? (
				isPickBanStep && turnOfResult ? (
					<TournamentMatchActionPickBanTab
						key={`${turnOfResult.teamId}-${data.pickBanEventCount}`}
						data={data}
						teams={pickBanTeams}
						turnOfResult={turnOfResult}
					/>
				) : (
					<TournamentMatchActionTab data={data} ownTeamId={userTeamId} />
				)
			) : null}
			{tabs.includes(TAB_KEYS.ADMIN) ? (
				<TournamentMatchAdminTab data={data} />
			) : null}
		</MatchTabs>
	);
}

function resolveTimelineTeams(
	opponentOneId: number,
	opponentTwoId: number,
	tournament: ReturnType<typeof useTournament>,
) {
	const teamOne = tournament.teamById(opponentOneId);
	const teamTwo = tournament.teamById(opponentTwoId);

	return {
		alpha: {
			name: teamOne?.name ?? "?",
			avatar: teamOne
				? (tournament.tournamentTeamLogoSrc(teamOne) ?? undefined)
				: undefined,
		},
		bravo: {
			name: teamTwo?.name ?? "?",
			avatar: teamTwo
				? (tournament.tournamentTeamLogoSrc(teamTwo) ?? undefined)
				: undefined,
		},
	};
}

function resolveTimelineMaps(
	data: TournamentMatchLoaderData,
	opponentOneId: number,
	opponentTwoId: number,
): TimelineMap[] {
	const playerById = new Map(data.match.players.map((p) => [p.id, p]));

	const resolveRoster = (
		participants: (typeof data.results)[number]["participants"],
		tournamentTeamId: number,
	) =>
		participants
			.filter((p) => p.tournamentTeamId === tournamentTeamId)
			.map((p) => playerById.get(p.userId))
			.filter((u): u is NonNullable<typeof u> => u != null)
			.map((u) => ({
				id: u.id,
				username: u.username,
				discordId: u.discordId,
				discordAvatar: u.discordAvatar,
				customUrl: u.customUrl,
			}));

	return data.results.map((result, mapIndex) => {
		const hasPoints =
			result.opponentOnePoints !== null && result.opponentTwoPoints !== null;

		const alphaRoster = resolveRoster(result.participants, opponentOneId);
		const bravoRoster = resolveRoster(result.participants, opponentTwoId);

		const weaponFor = (userId: number) =>
			data.reportedWeapons?.find(
				(w) => w.mapIndex === mapIndex && w.userId === userId,
			)?.weaponSplId ?? null;

		const alphaWeapons = alphaRoster.map((u) => weaponFor(u.id));
		const bravoWeapons = bravoRoster.map((u) => weaponFor(u.id));
		const hasAnyWeapon =
			alphaWeapons.some((w) => w !== null) ||
			bravoWeapons.some((w) => w !== null);

		return {
			stageId: result.stageId,
			mode: result.mode,
			timestamp: databaseTimestampToJavascriptTimestamp(result.createdAt),
			winner:
				result.winnerTeamId === opponentOneId
					? ("ALPHA" as const)
					: ("BRAVO" as const),
			rosters: {
				alpha: alphaRoster,
				bravo: bravoRoster,
			},
			weapons: hasAnyWeapon
				? { alpha: alphaWeapons, bravo: bravoWeapons }
				: undefined,
			points: hasPoints
				? ([result.opponentOnePoints, result.opponentTwoPoints] as [
						number,
						number,
					])
				: undefined,
		};
	});
}

function resolveTimelinePickBanData(
	data: TournamentMatchLoaderData,
	opponentOneId: number,
	pickBanTeams:
		| [
				ReturnType<ReturnType<typeof useTournament>["teamById"]>,
				ReturnType<ReturnType<typeof useTournament>["teamById"]>,
		  ]
		| undefined,
):
	| {
			rowsBySlot: TimelinePickBanEvent[][];
			pickedBySlot: Map<number, "ALPHA" | "BRAVO">;
	  }
	| undefined {
	const maps = data.match.roundMaps;
	if (!maps?.pickBan || !pickBanTeams?.[0] || !pickBanTeams[1]) {
		return undefined;
	}

	const pickBanTeamsLite: [PickBan.PickBanTeam, PickBan.PickBanTeam] = [
		{ id: pickBanTeams[0].id, seed: pickBanTeams[0].seed ?? 0 },
		{ id: pickBanTeams[1].id, seed: pickBanTeams[1].seed ?? 0 },
	];

	const rowsBySlot: TimelinePickBanEvent[][] = Array.from(
		{ length: data.results.length + 1 },
		() => [],
	);
	const pickedBySlot = new Map<number, "ALPHA" | "BRAVO">();

	for (let i = 0; i < data.pickBanEvents.length; i++) {
		const event = data.pickBanEvents[i]!;
		if (event.type === "ROLL") continue;

		const teamId = PickBan.teamOfEvent({
			eventIndex: i,
			maps,
			teams: pickBanTeamsLite,
			results: data.results,
		});
		if (teamId === null) continue;

		const slot = slotOfEvent({ eventIndex: i, maps });
		const side: "ALPHA" | "BRAVO" =
			teamId === opponentOneId ? "ALPHA" : "BRAVO";

		const isMapPick = event.type === "PICK" && event.stageId !== null;
		if (isMapPick && slot < data.results.length) {
			pickedBySlot.set(slot, side);
			continue;
		}

		const isPick = event.type === "PICK" || event.type === "MODE_PICK";
		const kind: "PICK" | "BAN" = isPick ? "PICK" : "BAN";
		const bucketIndex = Math.min(slot, rowsBySlot.length - 1);
		const bucket = rowsBySlot[bucketIndex]!;
		const last = bucket[bucket.length - 1];
		const entry = {
			stageId: event.stageId ?? undefined,
			mode: event.mode ?? undefined,
		};

		if (last && last.kind === kind) {
			(side === "ALPHA" ? last.alphaEntries : last.bravoEntries).push(entry);
		} else {
			bucket.push({
				kind,
				alphaEntries: side === "ALPHA" ? [entry] : [],
				bravoEntries: side === "BRAVO" ? [entry] : [],
			});
		}
	}

	return { rowsBySlot, pickedBySlot };
}

function slotOfEvent({
	eventIndex,
	maps,
}: {
	eventIndex: number;
	maps: NonNullable<TournamentMatchLoaderData["match"]["roundMaps"]>;
}): number {
	switch (maps.pickBan) {
		case "BAN_2":
			return 0;
		case "COUNTERPICK":
		case "COUNTERPICK_MODE_REPEAT_OK":
			return eventIndex + 1;
		case "CUSTOM": {
			const customFlow = maps.customFlow;
			if (!customFlow) return 0;
			const preSetLength = customFlow.preSet.length;
			const postGameLength = customFlow.postGame.length;
			if (eventIndex < preSetLength) return 0;
			if (postGameLength === 0) return 0;
			return (
				PickBan.postGameCycleIndex({
					eventIndex,
					preSetLength,
					postGameLength,
				}) + 1
			);
		}
		default:
			return 0;
	}
}

function TournamentMatchJoinTab({ data }: { data: TournamentMatchLoaderData }) {
	const { onConfirmRoom, isConfirming } = useConfirmRoom();
	const {
		teams: [teamOne, teamTwo],
		joinPool,
		activeRoomLink,
	} = useMatch();
	if (!teamOne || !teamTwo || !joinPool || !activeRoomLink) return null;

	const hostingTeam = resolveHostingTeam([teamOne, teamTwo]);

	return (
		<MatchJoinTab
			{...activeRoomLink}
			hostedBy={activeRoomLink.hostedBy ?? hostingTeam.name}
			onConfirmRoom={onConfirmRoom}
			isConfirming={isConfirming}
			pool={joinPool}
			pass={resolveRoomPass(hostingTeam.id)}
			showNoSplatnetAlert={data.anyUserPrefersNoSplatnet}
		/>
	);
}

function TournamentMatchRosterTab({
	data,
}: {
	data: TournamentMatchLoaderData;
}) {
	const { t } = useTranslation(["tournament"]);
	const tournament = useTournament();
	const user = useUser();
	const fetcher = useFetcher();
	const {
		teams: [teamOne, teamTwo],
	} = useMatch();

	const tbdTeam = { defaultName: t("tournament:match.tbd"), members: [] };

	return (
		<MatchRosterTab
			minMembersPerTeam={tournament.minMembersPerTeam}
			canEditSubbedOut={[
				teamOne ? canEditSubbedOutForTeam(teamOne) : false,
				teamTwo ? canEditSubbedOutForTeam(teamTwo) : false,
			]}
			defaultIsEditing={[
				teamOne ? needsActiveRosterSelection(teamOne) : false,
				teamTwo ? needsActiveRosterSelection(teamTwo) : false,
			]}
			onSubbedOutChange={handleSubbedOutChange}
			isSubmitting={fetcher.state !== "idle"}
			teams={[
				teamOne ? rosterTeamData(teamOne) : tbdTeam,
				teamTwo ? rosterTeamData(teamTwo) : tbdTeam,
			]}
		/>
	);

	function rosterTeamData(
		team: NonNullable<ReturnType<typeof tournament.teamById>>,
	) {
		const subbedOut =
			!data.matchIsOver &&
			team.activeRosterUserIds &&
			team.members.length > tournament.minMembersPerTeam
				? team.members
						.filter((m) => !team.activeRosterUserIds!.includes(m.userId))
						.map((m) => m.userId)
				: undefined;

		return {
			team: {
				id: team.id,
				name: team.name,
				url: tournamentTeamPage({
					tournamentId: tournament.ctx.id,
					tournamentTeamId: team.id,
				}),
				avatar: tournament.tournamentTeamLogoSrc(team) ?? undefined,
			},
			members: team.members.map((m) => ({
				id: m.userId,
				username: m.username,
				discordId: m.discordId,
				discordAvatar: m.discordAvatar,
				customUrl: m.customUrl,
				inGameName: m.inGameName,
			})),
			subbedOut,
		};
	}

	function canEditSubbedOutForTeam(
		team: NonNullable<ReturnType<typeof tournament.teamById>>,
	) {
		if (data.matchIsOver) return false;
		if (team.members.length <= tournament.minMembersPerTeam) return false;

		const isMemberOfTeam = team.members.some((m) => m.userId === user?.id);
		return isMemberOfTeam || tournament.isOrganizer(user);
	}

	function needsActiveRosterSelection(
		team: NonNullable<ReturnType<typeof tournament.teamById>>,
	) {
		if (!canEditSubbedOutForTeam(team)) return false;
		return !tournamentTeamToActiveRosterUserIds(
			team,
			tournament.minMembersPerTeam,
		);
	}

	function handleSubbedOutChange(teamId: number, subbedOut: number[]) {
		const team = tournament.teamById(teamId);
		if (!team) return;

		const activeRoster = team.members
			.filter((m) => !subbedOut.includes(m.userId))
			.map((m) => m.userId);

		fetcher.submit(
			{
				_action: "SET_ACTIVE_ROSTER",
				roster: JSON.stringify(activeRoster),
				teamId: String(teamId),
			},
			{ method: "post" },
		);
	}
}
