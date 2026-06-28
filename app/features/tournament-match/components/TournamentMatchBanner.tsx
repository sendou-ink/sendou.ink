import { differenceInMinutes } from "date-fns";
import {
	Flag,
	Gavel,
	Hourglass,
	Lock,
	MousePointerClick,
	Users,
	X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Avatar } from "~/components/Avatar";
import { SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import {
	IconBanner,
	MatchBanner,
	MatchBannerContainer,
	MultiMatchBanner,
} from "~/components/match-page/MatchBanner";
import bannerStyles from "~/components/match-page/MatchBanner.module.css";
import { MatchBannerBottomRow } from "~/components/match-page/MatchBannerBottomRow";
import { MatchBannerStartedAt } from "~/components/match-page/MatchBannerStartedAt";
import { MatchBannerTimer } from "~/components/match-page/MatchBannerTimer";
import { MatchBannerTopRow } from "~/components/match-page/MatchBannerTopRow";
import type { TournamentRoundMaps } from "~/db/tables";
import { useTournament } from "~/features/tournament/routes/to.$id";
import {
	isLeagueRoundLocked,
	resolveLeagueRoundStartDate,
} from "~/features/tournament/tournament-utils";
import * as PickBan from "~/features/tournament-bracket/core/PickBan";
import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";
import { useAutoRerender } from "~/hooks/useAutoRerender";
import type { ModeShort } from "~/modules/in-game-lists/types";
import type { TournamentMaplistSource } from "~/modules/tournament-map-list-generator/types";
import { databaseTimestampToDate } from "~/utils/dates";
import type { TournamentMatchLoaderData } from "../loaders/to.$id.matches.$mid.server";
import { useMatch } from "../match-page-context";
import { resolveHostingTeam } from "../tournament-match-utils";

export function TournamentMatchBanner({
	data,
}: {
	data: TournamentMatchLoaderData;
}) {
	const { t } = useTranslation(["tournament"]);
	const { formatter: leagueRoundDateFormatter } = useDateTimeFormat({
		day: "numeric",
		month: "numeric",
		year: "numeric",
	});
	const tournament = useTournament();
	const {
		currentMap,
		teamsMissingActiveRoster,
		matchIsLocked,
		joinPool,
		joinPass,
		teams,
	} = useMatch();

	const [teamOne, teamTwo] = teams;
	const hostingTeam =
		teamOne && teamTwo ? resolveHostingTeam([teamOne, teamTwo]) : null;
	const host = hostingTeam
		? {
				name: hostingTeam.name,
				avatarUrl: tournament.tournamentTeamLogoSrc(hostingTeam) ?? undefined,
			}
		: null;

	const opponentOne = data.match.opponentOne;
	const opponentTwo = data.match.opponentTwo;
	const isMissingTeam = !opponentOne?.id || !opponentTwo?.id;

	const droppedOutTeamName = resolveDroppedOutTeamName({
		data,
		tournament,
	});

	const leagueRoundLocked = isLeagueRoundLocked(tournament, data.match.roundId);
	const leagueRoundStartDate = leagueRoundLocked
		? resolveLeagueRoundStartDate(tournament, data.match.roundId)
		: null;

	const pickBanBanner = resolvePickBanBanner(data, tournament, t);

	const screenLegal =
		tournament.ctx.settings.enableNoScreenToggle &&
		typeof data.noScreen === "boolean"
			? !data.noScreen
			: undefined;

	const activeRosterByTeamId = (tournamentTeamId: number) => {
		const team = tournament.teamById(tournamentTeamId);
		if (!team) return null;

		const activeRosterUserIds = team.activeRosterUserIds;
		if (!activeRosterUserIds?.length) return null;

		return team.members
			.filter((member) => activeRosterUserIds.includes(member.userId))
			.map((member) => ({ ...member, id: member.userId }));
	};

	return (
		<MatchBannerContainer>
			<TournamentMatchBannerTopRow data={data} />
			{data.matchIsOver ? (
				droppedOutTeamName ? (
					<IconBanner
						icon={<Flag size={32} />}
						header={t("tournament:match.droppedOut.header")}
						subtitle={t("tournament:match.droppedOut.subtitle", {
							team: droppedOutTeamName,
						})}
					/>
				) : data.endedEarly ? (
					<IconBanner
						icon={<Gavel size={32} />}
						header={t("tournament:match.endedEarly.header")}
						subtitle={t("tournament:match.endedEarly.subtitle")}
					/>
				) : (
					<MultiMatchBanner
						stageIds={data.results.map((result) => result.stageId)}
					/>
				)
			) : leagueRoundLocked ? (
				<IconBanner
					icon={<Lock size={32} />}
					header={t("tournament:match.leagueLocked.header")}
					subtitle={
						leagueRoundStartDate
							? t("tournament:match.leagueLocked.subtitle", {
									date:
										leagueRoundDateFormatter.format(leagueRoundStartDate) ?? "",
								})
							: undefined
					}
				/>
			) : matchIsLocked ? (
				<IconBanner
					icon={<Lock size={32} />}
					header={t("tournament:match.locked.header")}
					subtitle={t("tournament:match.locked.subtitle")}
					screenLegal={screenLegal}
					joinPool={joinPool}
					joinPass={joinPass}
					host={host}
				/>
			) : isMissingTeam ? (
				<IconBanner
					icon={<Hourglass size={32} />}
					header={t("tournament:match.waitingForTeams.header")}
					subtitle={t("tournament:match.waitingForTeams.subtitle")}
				/>
			) : teamsMissingActiveRoster.length > 0 ? (
				<IconBanner
					icon={<Users size={32} />}
					header={t("tournament:match.activeRosterMissing.header")}
					subtitle={t("tournament:match.activeRosterMissing.subtitle", {
						teams: teamsMissingActiveRoster.join(" & "),
					})}
					screenLegal={screenLegal}
					joinPool={joinPool}
					joinPass={joinPass}
					host={host}
					testId="active-roster-needed-text"
				/>
			) : pickBanBanner ? (
				<IconBanner
					icon={pickBanBanner.icon}
					header={pickBanBanner.header}
					subtitle={pickBanBanner.subtitle}
					screenLegal={screenLegal}
					joinPool={joinPool}
					joinPass={joinPass}
					host={host}
				/>
			) : currentMap ? (
				<MatchBanner
					stageId={currentMap.stageId}
					mode={currentMap.mode}
					screenLegal={screenLegal}
					joinPool={joinPool}
					joinPass={joinPass}
					host={host}
				>
					<CurrentMapPickInfo
						source={currentMap.source}
						results={data.results}
						opponentIds={
							opponentOne?.id && opponentTwo?.id
								? [opponentOne.id, opponentTwo.id]
								: null
						}
						pickBan={data.match.roundMaps?.pickBan ?? null}
					/>
				</MatchBanner>
			) : null}
			<MatchBannerBottomRow
				games={resolveBannerGames({ data })}
				activeRosters={
					opponentOne?.id && opponentTwo?.id
						? {
								alpha: activeRosterByTeamId(opponentOne.id),
								bravo: activeRosterByTeamId(opponentTwo.id),
							}
						: null
				}
			/>
		</MatchBannerContainer>
	);
}

function TournamentMatchBannerTopRow({
	data,
}: {
	data: TournamentMatchLoaderData;
}) {
	const tournament = useTournament();
	const currentTime = useAutoRerender("ten seconds");
	const { scores } = useMatch();

	if (
		!data.match.startedAt ||
		!data.match.opponentOne ||
		!data.match.opponentTwo
	)
		return null;

	const startedAt = databaseTimestampToDate(data.match.startedAt);
	const totalMinutes = differenceInMinutes(currentTime, startedAt);

	const currentMinutes = resolveCurrentMinutes({
		data,
		tournament,
		currentTime,
	});

	return (
		<MatchBannerTopRow
			score={{
				alpha: scores[0],
				bravo: scores[1],
				isFinal:
					data.match.opponentOne?.result === "win" ||
					data.match.opponentTwo?.result === "win",
				count: data.match.roundMaps.count,
				bestOf: data.match.roundMaps.type === "BEST_OF",
			}}
		>
			{data.matchIsOver ? (
				<MatchBannerStartedAt time={startedAt} />
			) : (
				<MatchBannerTimer time={{ currentMinutes, totalMinutes }} />
			)}
		</MatchBannerTopRow>
	);
}

function CurrentMapPickInfo({
	source,
	results,
	opponentIds,
	pickBan,
}: {
	source: TournamentMaplistSource;
	results: Array<{ winnerTeamId: number }>;
	opponentIds: [number, number] | null;
	pickBan: TournamentRoundMaps["pickBan"] | null;
}) {
	const { t } = useTranslation(["tournament"]);
	const tournament = useTournament();

	const picker = resolveCurrentMapPicker({
		source,
		results,
		opponentIds,
		pickBan,
	});
	if (!picker) return null;

	const teamIds = picker.kind === "BOTH" ? picker.teamIds : [picker.teamId];
	const teams = teamIds
		.map((teamId) => tournament.teamById(teamId))
		.filter((team) => team !== undefined);
	if (teams.length !== teamIds.length) return null;

	const text = (() => {
		switch (picker.kind) {
			case "BOTH":
				return t("tournament:pickInfo.both");
			case "COUNTERPICK":
				return t("tournament:pickInfo.counterpickedBy", {
					teamName: teams[0].name,
				});
			default:
				return t("tournament:pickInfo.pickedBy", { teamName: teams[0].name });
		}
	})();

	return (
		<SendouPopover
			trigger={
				<SendouButton variant="minimal" className={bannerStyles.infoBadge}>
					{teams.map((team) => (
						<Avatar
							key={team.id}
							url={tournament.tournamentTeamLogoSrc(team)}
							identiconInput={team.name}
							size="xxs"
						/>
					))}
				</SendouButton>
			}
		>
			{text}
		</SendouPopover>
	);
}

function resolveCurrentMapPicker({
	source,
	results,
	opponentIds,
	pickBan,
}: {
	source: TournamentMaplistSource;
	results: Array<{ winnerTeamId: number }>;
	opponentIds: [number, number] | null;
	pickBan: TournamentRoundMaps["pickBan"] | null;
}):
	| { teamId: number; kind: "PICK" | "COUNTERPICK" }
	| { teamIds: [number, number]; kind: "BOTH" }
	| null {
	if (!opponentIds) return null;

	if (typeof source === "number") {
		if (!opponentIds.includes(source)) return null;
		return { teamId: source, kind: "PICK" };
	}

	if (source === "BOTH") {
		return { teamIds: opponentIds, kind: "BOTH" };
	}

	if (
		source === "COUNTERPICK" &&
		(pickBan === "COUNTERPICK" || pickBan === "COUNTERPICK_MODE_REPEAT_OK")
	) {
		const lastResult = results[results.length - 1];
		if (!lastResult) return null;
		const counterpickerId = opponentIds.find(
			(id) => id !== lastResult.winnerTeamId,
		);
		if (counterpickerId === undefined) return null;
		return { teamId: counterpickerId, kind: "COUNTERPICK" };
	}

	return null;
}

function resolveCurrentMinutes({
	data,
	tournament,
	currentTime,
}: {
	data: TournamentMatchLoaderData;
	tournament: ReturnType<typeof useTournament>;
	currentTime: Date;
}): number {
	if (data.matchIsOver) return 0;

	const sessionStart = resolveCurrentSessionStartedAt({ data, tournament });
	if (typeof sessionStart !== "number") return 0;

	return Math.max(
		0,
		differenceInMinutes(currentTime, databaseTimestampToDate(sessionStart)),
	);
}

/**
 * Resolves the database timestamp that the current "session" (the thing the
 * sub-timer counts up from) started at. For pick/ban matches this is the start
 * of the current pick/ban turn, otherwise it is the time the most recently
 * reported game finished, falling back to the match start.
 */
function resolveCurrentSessionStartedAt({
	data,
	tournament,
}: {
	data: TournamentMatchLoaderData;
	tournament: ReturnType<typeof useTournament>;
}): number | null {
	const lastGameStartedAt =
		data.results.at(-1)?.createdAt ?? data.match.startedAt;

	const opponentOneId = data.match.opponentOne?.id;
	const opponentTwoId = data.match.opponentTwo?.id;
	if (!opponentOneId || !opponentTwoId) return lastGameStartedAt;
	if (!data.match.roundMaps?.pickBan) return lastGameStartedAt;

	const teamOne = tournament.teamById(opponentOneId);
	const teamTwo = tournament.teamById(opponentTwoId);
	if (!teamOne || !teamTwo) return lastGameStartedAt;

	const teams: [PickBan.PickBanTeam, PickBan.PickBanTeam] = [
		{ id: teamOne.id, seed: teamOne.seed },
		{ id: teamTwo.id, seed: teamTwo.seed },
	];

	const currentTurn = PickBan.turnOf({
		results: data.results,
		maps: data.match.roundMaps,
		teams,
		mapList: data.mapList,
		pickBanEventCount: data.pickBanEventCount,
	});
	if (!currentTurn) return lastGameStartedAt;

	return (
		PickBan.currentTurnSessionStartedAt({
			currentTurn,
			events: data.pickBanEvents,
			results: data.results,
			matchStartedAt: data.match.startedAt,
			maps: data.match.roundMaps,
			teams,
		}) ?? lastGameStartedAt
	);
}

function resolvePickBanBanner(
	data: TournamentMatchLoaderData,
	tournament: ReturnType<typeof useTournament>,
	t: ReturnType<typeof useTranslation<["tournament"]>>["t"],
): { icon: React.ReactNode; header: string; subtitle: string } | null {
	if (data.matchIsOver) return null;
	if (!data.match.roundMaps?.pickBan) return null;

	const opponentOneId = data.match.opponentOne?.id;
	const opponentTwoId = data.match.opponentTwo?.id;
	if (!opponentOneId || !opponentTwoId) return null;

	const teamOne = tournament.teamById(opponentOneId);
	const teamTwo = tournament.teamById(opponentTwoId);
	if (!teamOne || !teamTwo) return null;

	const turnOfResult = PickBan.turnOf({
		results: data.results,
		maps: data.match.roundMaps,
		teams: [
			{ id: teamOne.id, seed: teamOne.seed },
			{ id: teamTwo.id, seed: teamTwo.seed },
		],
		mapList: data.mapList,
		pickBanEventCount: data.pickBanEventCount,
	});
	if (!turnOfResult) return null;

	const pickingTeam = turnOfResult.teamId === teamOne.id ? teamOne : teamTwo;

	const isCustom = data.match.roundMaps.pickBan === "CUSTOM";
	const isCounterpick =
		data.match.roundMaps.pickBan === "COUNTERPICK" ||
		data.match.roundMaps.pickBan === "COUNTERPICK_MODE_REPEAT_OK";

	const stepCounter =
		isCustom && turnOfResult.stepTotal && turnOfResult.stepTotal > 1
			? ` (${turnOfResult.stepCurrent}/${turnOfResult.stepTotal})`
			: "";

	const header = (() => {
		if (isCounterpick) return t("tournament:pickBan.counterpick");
		switch (turnOfResult.action) {
			case "PICK":
				return t("tournament:pickBan.pickMap") + stepCounter;
			case "BAN":
				return t("tournament:pickBan.banMap") + stepCounter;
			case "MODE_PICK":
				return t("tournament:pickBan.pickMode") + stepCounter;
			case "MODE_BAN":
				return t("tournament:pickBan.banMode") + stepCounter;
			default:
				return "";
		}
	})();

	if (!header) return null;

	const isBan =
		turnOfResult.action === "BAN" || turnOfResult.action === "MODE_BAN";

	return {
		icon: isBan ? <X size={32} /> : <MousePointerClick size={32} />,
		header,
		subtitle: t("tournament:pickBan.waitingFor", {
			teamName: pickingTeam.name,
		}),
	};
}

function resolveDroppedOutTeamName({
	data,
	tournament,
}: {
	data: TournamentMatchLoaderData;
	tournament: ReturnType<typeof useTournament>;
}): string | null {
	if (!data.matchIsOver || data.results.length > 0) return null;

	const droppedOutId =
		data.match.opponentOne?.result === "loss"
			? data.match.opponentOne.id
			: data.match.opponentTwo?.result === "loss"
				? data.match.opponentTwo.id
				: null;
	if (!droppedOutId) return null;

	const team = tournament.teamById(droppedOutId);
	if (!team?.droppedOut) return null;

	return team.name;
}

function resolveBannerGames({
	data,
}: {
	data: TournamentMatchLoaderData;
}): Array<{ mode: ModeShort | null }> {
	const playedAndScheduled =
		data.mapList
			?.filter((map) => !map.bannedByTournamentTeamId)
			.map((map) => ({
				mode: map.mode as ModeShort | null,
			})) ?? [];

	if (data.matchIsOver) return playedAndScheduled;

	const placeholderCount = Math.max(
		0,
		data.match.roundMaps.count - playedAndScheduled.length,
	);

	return [
		...playedAndScheduled,
		...Array.from({ length: placeholderCount }, () => ({
			mode: null,
		})),
	];
}
