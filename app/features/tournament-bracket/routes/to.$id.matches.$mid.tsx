import type { ActionFunction, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useRevalidator } from "@remix-run/react";
import clsx from "clsx";
import { nanoid } from "nanoid";
import * as React from "react";
import { useEventSource } from "remix-utils/sse/react";
import { LinkButton } from "~/components/Button";
import { containerClassName } from "~/components/Main";
import { ArrowLongLeftIcon } from "~/components/icons/ArrowLongLeft";
import { sql } from "~/db/sql";
import { useUser } from "~/features/auth/core/user";
import { requireUser } from "~/features/auth/core/user.server";
import { tournamentIdFromParams } from "~/features/tournament";
import * as TournamentMatchRepository from "~/features/tournament-bracket/TournamentMatchRepository.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import { useTournament } from "~/features/tournament/routes/to.$id";
import { useSearchParamState } from "~/hooks/useSearchParamState";
import { useVisibilityChange } from "~/hooks/useVisibilityChange";
import { canReportTournamentScore } from "~/permissions";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";
import {
	notFoundIfFalsy,
	parseParams,
	parseRequestPayload,
	validate,
} from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import {
	tournamentBracketsPage,
	tournamentMatchSubscribePage,
} from "~/utils/urls";
import { CastInfo } from "../components/CastInfo";
import { MatchRosters } from "../components/MatchRosters";
import { OrganizerMatchMapListDialog } from "../components/OrganizerMatchMapListDialog";
import { StartedMatch } from "../components/StartedMatch";
import * as PickBan from "../core/PickBan";
import {
	clearTournamentDataCache,
	tournamentFromDB,
} from "../core/Tournament.server";
import { getServerTournamentManager } from "../core/brackets-manager/manager.server";
import { emitter } from "../core/emitters.server";
import { resolveMapList } from "../core/mapList.server";
import { getRounds } from "../core/rounds";
import { deleteMatchPickBanEvents } from "../queries/deleteMatchPickBanEvents.server";
import { deleteParticipantsByMatchGameResultId } from "../queries/deleteParticipantsByMatchGameResultId.server";
import { deletePickBanEvent } from "../queries/deletePickBanEvent.server";
import { deleteTournamentMatchGameResultById } from "../queries/deleteTournamentMatchGameResultById.server";
import { findMatchById } from "../queries/findMatchById.server";
import { findResultsByMatchId } from "../queries/findResultsByMatchId.server";
import { insertTournamentMatchGameResult } from "../queries/insertTournamentMatchGameResult.server";
import { insertTournamentMatchGameResultParticipant } from "../queries/insertTournamentMatchGameResultParticipant.server";
import { updateMatchGameResultPoints } from "../queries/updateMatchGameResultPoints.server";
import {
	matchPageParamsSchema,
	matchSchema,
} from "../tournament-bracket-schemas.server";
import {
	bracketSubscriptionKey,
	groupNumberToLetters,
	isSetOverByScore,
	matchIsLocked,
	matchSubscriptionKey,
	tournamentTeamToActiveRosterUserIds,
} from "../tournament-bracket-utils";

import "../tournament-bracket.css";

export const action: ActionFunction = async ({ params, request }) => {
	const user = await requireUser(request);
	const matchId = parseParams({
		params,
		schema: matchPageParamsSchema,
	}).mid;
	const match = notFoundIfFalsy(findMatchById(matchId));
	const data = await parseRequestPayload({
		request,
		schema: matchSchema,
	});

	const tournamentId = tournamentIdFromParams(params);
	const tournament = await tournamentFromDB({ tournamentId, user });

	const validateCanReportScore = () => {
		const isMemberOfATeamInTheMatch = match.players.some(
			(p) => p.id === user?.id,
		);

		validate(
			canReportTournamentScore({
				match,
				isMemberOfATeamInTheMatch,
				isOrganizer: tournament.isOrganizer(user),
			}),
			"Unauthorized",
			401,
		);
	};

	const manager = getServerTournamentManager();

	const scores: [number, number] = [
		match.opponentOne?.score ?? 0,
		match.opponentTwo?.score ?? 0,
	];

	const pickBanEvents = match.roundMaps?.pickBan
		? await TournamentRepository.pickBanEventsByMatchId(match.id)
		: [];

	const mapList =
		match.opponentOne?.id && match.opponentTwo?.id
			? resolveMapList({
					bestOf: match.bestOf,
					tournamentId,
					matchId,
					teams: [match.opponentOne.id, match.opponentTwo.id],
					mapPickingStyle: match.mapPickingStyle,
					maps: match.roundMaps,
					pickBanEvents,
				})
			: null;

	let emitMatchUpdate = false;
	let emitBracketUpdate = false;
	switch (data._action) {
		case "REPORT_SCORE": {
			// they are trying to report score that was already reported
			// assume that it was already reported and make their page refresh
			if (data.position !== scores[0] + scores[1]) {
				return null;
			}

			validateCanReportScore();
			validate(
				match.opponentOne?.id === data.winnerTeamId ||
					match.opponentTwo?.id === data.winnerTeamId,
				"Winner team id is invalid",
			);
			validate(match.opponentOne && match.opponentTwo, "Teams are missing");
			validate(
				!matchIsLocked({ matchId: match.id, tournament, scores }),
				"Match is locked",
			);

			const currentMap = mapList?.filter((m) => !m.bannedByTournamentTeamId)[
				data.position
			];
			invariant(currentMap, "Can't resolve current map");

			const scoreToIncrement = () => {
				if (data.winnerTeamId === match.opponentOne?.id) return 0;
				if (data.winnerTeamId === match.opponentTwo?.id) return 1;

				validate(false, "Winner team id is invalid");
			};

			validate(
				!data.points ||
					(scoreToIncrement() === 0 && data.points[0] > data.points[1]) ||
					(scoreToIncrement() === 1 && data.points[1] > data.points[0]),
				"Points are invalid (winner must have more points than loser)",
			);

			// TODO: could also validate that if bracket demands it then points are defined

			scores[scoreToIncrement()]++;

			const setOver = isSetOverByScore({
				count: match.roundMaps?.count ?? match.bestOf,
				countType: match.roundMaps?.type ?? "BEST_OF",
				scores,
			});

			const teamOneRoster = tournamentTeamToActiveRosterUserIds(
				tournament.teamById(match.opponentOne.id!)!,
				tournament.minMembersPerTeam,
			);
			const teamTwoRoster = tournamentTeamToActiveRosterUserIds(
				tournament.teamById(match.opponentTwo.id!)!,
				tournament.minMembersPerTeam,
			);

			validate(teamOneRoster, "Team one has no active roster");
			validate(teamTwoRoster, "Team two has no active roster");

			validate(
				new Set([...teamOneRoster, ...teamTwoRoster]).size ===
					tournament.minMembersPerTeam * 2,
				"Duplicate user in rosters",
			);

			sql.transaction(() => {
				manager.update.match({
					id: match.id,
					opponent1: {
						score: scores[0],
						result: setOver && scores[0] > scores[1] ? "win" : undefined,
					},
					opponent2: {
						score: scores[1],
						result: setOver && scores[1] > scores[0] ? "win" : undefined,
					},
				});

				const result = insertTournamentMatchGameResult({
					matchId: match.id,
					mode: currentMap.mode,
					stageId: currentMap.stageId,
					reporterId: user.id,
					winnerTeamId: data.winnerTeamId,
					number: data.position + 1,
					source: String(currentMap.source),
					opponentOnePoints: data.points?.[0] ?? null,
					opponentTwoPoints: data.points?.[1] ?? null,
				});

				for (const userId of teamOneRoster) {
					insertTournamentMatchGameResultParticipant({
						matchGameResultId: result.id,
						userId,
						tournamentTeamId: match.opponentOne!.id!,
					});
				}
				for (const userId of teamTwoRoster) {
					insertTournamentMatchGameResultParticipant({
						matchGameResultId: result.id,
						userId,
						tournamentTeamId: match.opponentTwo!.id!,
					});
				}
			})();

			emitMatchUpdate = true;
			emitBracketUpdate = true;

			break;
		}
		case "SET_ACTIVE_ROSTER": {
			validate(!tournament.everyBracketOver, "Tournament is over");
			validate(
				tournament.isOrganizer(user) ||
					tournament.teamMemberOfByUser(user)?.id === data.teamId,
				"Unauthorized",
				401,
			);
			validate(
				data.roster.length === tournament.minMembersPerTeam,
				"Invalid roster length",
			);

			const team = tournament.teamById(data.teamId)!;
			validate(
				data.roster.every((userId) =>
					team.members.some((m) => m.userId === userId),
				),
				"Invalid roster",
			);

			await TournamentTeamRepository.setActiveRoster({
				teamId: data.teamId,
				activeRosterUserIds: data.roster,
			});

			emitMatchUpdate = true;

			break;
		}
		case "UNDO_REPORT_SCORE": {
			validateCanReportScore();
			// they are trying to remove score from the past
			if (data.position !== scores[0] + scores[1] - 1) {
				return null;
			}

			const results = findResultsByMatchId(matchId);
			const lastResult = results[results.length - 1];
			invariant(lastResult, "Last result is missing");

			const shouldReset = results.length === 1;

			if (lastResult.winnerTeamId === match.opponentOne?.id) {
				scores[0]--;
			} else {
				scores[1]--;
			}

			logger.info(
				`Undoing score: Position: ${data.position}; User ID: ${user.id}; Match ID: ${match.id}`,
			);

			const pickBanEventToDeleteNumber = await (async () => {
				if (!match.roundMaps?.pickBan) return;

				const pickBanEvents = await TournamentRepository.pickBanEventsByMatchId(
					match.id,
				);

				const unplayedPicks = pickBanEvents
					.filter((e) => e.type === "PICK")
					.filter(
						(e) =>
							!results.some(
								(r) => r.stageId === e.stageId && r.mode === e.mode,
							),
					);
				invariant(unplayedPicks.length <= 1, "Too many unplayed picks");

				return unplayedPicks[0]?.number;
			})();

			sql.transaction(() => {
				deleteTournamentMatchGameResultById(lastResult.id);

				manager.update.match({
					id: match.id,
					opponent1: {
						score: shouldReset ? undefined : scores[0],
					},
					opponent2: {
						score: shouldReset ? undefined : scores[1],
					},
				});

				if (shouldReset) {
					manager.reset.matchResults(match.id);
				}

				if (typeof pickBanEventToDeleteNumber === "number") {
					deletePickBanEvent({ matchId, number: pickBanEventToDeleteNumber });
				}
			})();

			emitMatchUpdate = true;
			emitBracketUpdate = true;

			break;
		}
		case "UPDATE_REPORTED_SCORE": {
			validate(tournament.isOrganizer(user));
			validate(!tournament.ctx.isFinalized, "Tournament is finalized");

			const result = await TournamentMatchRepository.findResultById(
				data.resultId,
			);
			validate(result, "Result not found");
			validate(
				data.rosters[0].length === tournament.minMembersPerTeam &&
					data.rosters[1].length === tournament.minMembersPerTeam,
				"Invalid roster length",
			);

			const hadPoints = typeof result.opponentOnePoints === "number";
			const willHavePoints = typeof data.points?.[0] === "number";
			validate(
				(hadPoints && willHavePoints) || (!hadPoints && !willHavePoints),
				"Points mismatch",
			);

			if (data.points) {
				if (data.points[0] !== result.opponentOnePoints) {
					// changing points at this point could retroactively change who advanced from the group
					validate(
						tournament.matchCanBeReopened(match.id),
						"Bracket has progressed",
					);
				}

				if (result.opponentOnePoints! > result.opponentTwoPoints!) {
					validate(
						data.points[0] > data.points[1],
						"Winner must have more points than loser",
					);
				} else {
					validate(
						data.points[0] < data.points[1],
						"Winner must have more points than loser",
					);
				}
			}

			sql.transaction(() => {
				if (data.points) {
					updateMatchGameResultPoints({
						matchGameResultId: result.id,
						opponentOnePoints: data.points[0],
						opponentTwoPoints: data.points[1],
					});
				}

				deleteParticipantsByMatchGameResultId(result.id);

				for (const userId of data.rosters[0]) {
					insertTournamentMatchGameResultParticipant({
						matchGameResultId: result.id,
						userId,
						tournamentTeamId: match.opponentOne!.id!,
					});
				}
				for (const userId of data.rosters[1]) {
					insertTournamentMatchGameResultParticipant({
						matchGameResultId: result.id,
						userId,
						tournamentTeamId: match.opponentTwo!.id!,
					});
				}
			})();

			emitMatchUpdate = true;
			emitBracketUpdate = true;

			break;
		}
		case "BAN_PICK": {
			const results = findResultsByMatchId(matchId);

			const teamOne = match.opponentOne?.id
				? tournament.teamById(match.opponentOne.id)
				: undefined;
			const teamTwo = match.opponentTwo?.id
				? tournament.teamById(match.opponentTwo.id)
				: undefined;
			invariant(teamOne && teamTwo, "Teams are missing");

			invariant(
				match.roundMaps && match.opponentOne?.id && match.opponentTwo?.id,
				"Missing fields to pick/ban",
			);
			const pickerTeamId = PickBan.turnOf({
				results,
				maps: match.roundMaps,
				teams: [match.opponentOne.id, match.opponentTwo.id],
				mapList,
			});
			validate(pickerTeamId, "Not time to pick/ban");
			validate(
				tournament.isOrganizer(user) ||
					tournament.ownedTeamByUser(user)?.id === pickerTeamId,
				"Unauthorized",
				401,
			);

			validate(
				PickBan.isLegal({
					results,
					map: data,
					maps: match.roundMaps,
					toSetMapPool:
						tournament.ctx.mapPickingStyle === "TO"
							? await TournamentRepository.findTOSetMapPoolById(tournamentId)
							: [],
					mapList,
					tieBreakerMapPool: tournament.ctx.tieBreakerMapPool,
					teams: [teamOne, teamTwo],
					pickerTeamId,
				}),
				"Illegal pick",
			);

			const pickBanEvents = await TournamentRepository.pickBanEventsByMatchId(
				match.id,
			);
			await TournamentRepository.addPickBanEvent({
				authorId: user.id,
				matchId: match.id,
				stageId: data.stageId,
				mode: data.mode,
				number: pickBanEvents.length + 1,
				type: match.roundMaps.pickBan === "BAN_2" ? "BAN" : "PICK",
			});

			emitMatchUpdate = true;

			break;
		}
		case "REOPEN_MATCH": {
			const scoreOne = match.opponentOne?.score ?? 0;
			const scoreTwo = match.opponentTwo?.score ?? 0;
			invariant(typeof scoreOne === "number", "Score one is missing");
			invariant(typeof scoreTwo === "number", "Score two is missing");
			invariant(scoreOne !== scoreTwo, "Scores are equal");

			validate(tournament.isOrganizer(user));
			validate(
				tournament.matchCanBeReopened(match.id),
				"Match can't be reopened, bracket has progressed",
			);

			const results = findResultsByMatchId(matchId);
			const lastResult = results[results.length - 1];
			invariant(lastResult, "Last result is missing");

			if (scoreOne > scoreTwo) {
				scores[0]--;
			} else {
				scores[1]--;
			}

			logger.info(
				`Reopening match: User ID: ${user.id}; Match ID: ${match.id}`,
			);

			const followingMatches = tournament.followingMatches(match.id);
			sql.transaction(() => {
				for (const match of followingMatches) {
					deleteMatchPickBanEvents({ matchId: match.id });
				}
				deleteTournamentMatchGameResultById(lastResult.id);
				manager.update.match({
					id: match.id,
					opponent1: {
						score: scores[0],
						result: undefined,
					},
					opponent2: {
						score: scores[1],
						result: undefined,
					},
				});
			})();

			emitMatchUpdate = true;
			emitBracketUpdate = true;

			break;
		}
		case "SET_AS_CASTED": {
			validate(tournament.isOrganizerOrStreamer(user));

			await TournamentRepository.setMatchAsCasted({
				matchId: match.id,
				tournamentId: tournament.ctx.id,
				twitchAccount: data.twitchAccount,
			});

			emitBracketUpdate = true;

			break;
		}
		case "LOCK": {
			validate(tournament.isOrganizerOrStreamer(user));

			// can't lock, let's update their view to reflect that
			if (match.opponentOne?.id && match.opponentTwo?.id) {
				return null;
			}

			await TournamentRepository.lockMatch({
				matchId: match.id,
				tournamentId: tournament.ctx.id,
			});

			emitMatchUpdate = true;

			break;
		}
		case "UNLOCK": {
			validate(tournament.isOrganizerOrStreamer(user));

			await TournamentRepository.unlockMatch({
				matchId: match.id,
				tournamentId: tournament.ctx.id,
			});

			emitMatchUpdate = true;

			break;
		}
		default: {
			assertUnreachable(data);
		}
	}

	if (emitMatchUpdate) {
		emitter.emit(matchSubscriptionKey(match.id), {
			eventId: nanoid(),
			userId: user.id,
		});
	}
	if (emitBracketUpdate) {
		emitter.emit(bracketSubscriptionKey(tournament.ctx.id), {
			matchId: match.id,
			scores,
			isOver:
				scores[0] === Math.ceil(match.bestOf / 2) ||
				scores[1] === Math.ceil(match.bestOf / 2),
		});
	}

	clearTournamentDataCache(tournamentId);

	return null;
};

export type TournamentMatchLoaderData = typeof loader;

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const tournamentId = tournamentIdFromParams(params);
	const matchId = parseParams({
		params,
		schema: matchPageParamsSchema,
	}).mid;

	const match = notFoundIfFalsy(findMatchById(matchId));

	const isBye = !match.opponentOne || !match.opponentTwo;
	if (isBye) {
		throw new Response(null, { status: 404 });
	}

	const pickBanEvents = match.roundMaps?.pickBan
		? await TournamentRepository.pickBanEventsByMatchId(match.id)
		: [];

	const mapList =
		match.opponentOne?.id && match.opponentTwo?.id
			? resolveMapList({
					bestOf: match.bestOf,
					tournamentId,
					matchId,
					teams: [match.opponentOne.id, match.opponentTwo.id],
					mapPickingStyle: match.mapPickingStyle,
					maps: match.roundMaps,
					pickBanEvents,
				})
			: null;

	return {
		match,
		results: findResultsByMatchId(matchId),
		mapList,
		matchIsOver:
			match.opponentOne?.result === "win" ||
			match.opponentTwo?.result === "win",
	};
};

export default function TournamentMatchPage() {
	const user = useUser();
	const visibility = useVisibilityChange();
	const { revalidate } = useRevalidator();
	const tournament = useTournament();
	const data = useLoaderData<typeof loader>();

	React.useEffect(() => {
		if (visibility !== "visible" || data.matchIsOver) return;

		revalidate();
	}, [visibility, revalidate, data.matchIsOver]);

	const type =
		tournament.canReportScore({ matchId: data.match.id, user }) ||
		tournament.isOrganizerOrStreamer(user)
			? "EDIT"
			: "OTHER";

	const showRosterPeek = () => {
		if (data.matchIsOver) return false;

		if (!data.match.opponentOne?.id || !data.match.opponentTwo?.id) return true;

		return type !== "EDIT";
	};

	return (
		<div className={clsx("stack lg", containerClassName("normal"))}>
			{!data.matchIsOver && visibility !== "hidden" ? <AutoRefresher /> : null}
			<div className="flex horizontal justify-between items-center">
				<MatchHeader />
				<div className="stack md horizontal flex-wrap-reverse justify-end">
					{tournament.isOrganizerOrStreamer(user) ? (
						<OrganizerMatchMapListDialog data={data} />
					) : null}
					<LinkButton
						to={tournamentBracketsPage({
							tournamentId: tournament.ctx.id,
							bracketIdx: tournament.matchIdToBracketIdx(data.match.id),
							groupId: data.match.groupId,
						})}
						variant="outlined"
						size="tiny"
						className="w-max"
						icon={<ArrowLongLeftIcon />}
						testId="back-to-bracket-button"
					>
						Back to bracket
					</LinkButton>
				</div>
			</div>
			<div className="stack md">
				<CastInfo
					matchIsOngoing={Boolean(
						(data.match.opponentOne?.score &&
							data.match.opponentOne.score > 0) ||
							(data.match.opponentTwo?.score &&
								data.match.opponentTwo.score > 0),
					)}
					matchIsOver={data.matchIsOver}
					matchId={data.match.id}
					hasBothParticipants={Boolean(
						data.match.opponentOne?.id && data.match.opponentTwo?.id,
					)}
				/>
				{data.matchIsOver ? <ResultsSection /> : null}
				{!data.matchIsOver &&
				typeof data.match.opponentOne?.id === "number" &&
				typeof data.match.opponentTwo?.id === "number" ? (
					<MapListSection
						teams={[data.match.opponentOne.id, data.match.opponentTwo.id]}
						type={type}
					/>
				) : null}
				{showRosterPeek() ? (
					<MatchRosters
						teams={[data.match.opponentOne?.id, data.match.opponentTwo?.id]}
					/>
				) : null}
			</div>
		</div>
	);
}

function MatchHeader() {
	const tournament = useTournament();
	const data = useLoaderData<typeof loader>();

	const { bracketName, roundName } = React.useMemo(() => {
		let bracketName: string | undefined;
		let roundName: string | undefined;

		for (const bracket of tournament.brackets) {
			if (bracket.preview) continue;

			for (const match of bracket.data.match) {
				if (match.id === data.match.id) {
					bracketName = bracket.name;

					if (bracket.type === "round_robin") {
						const group = bracket.data.group.find(
							(group) => group.id === match.group_id,
						);
						const round = bracket.data.round.find(
							(round) => round.id === match.round_id,
						);

						roundName = `Groups ${group?.number ? groupNumberToLetters(group.number) : ""}${round?.number ?? ""}.${match.number}`;
					} else if (bracket.type === "swiss") {
						const group = bracket.data.group.find(
							(group) => group.id === match.group_id,
						);
						const round = bracket.data.round.find(
							(round) => round.id === match.round_id,
						);

						const oneGroupOnly = bracket.data.group.length === 1;

						roundName = `Swiss${oneGroupOnly ? "" : " Group"} ${group?.number && !oneGroupOnly ? groupNumberToLetters(group.number) : ""} ${round?.number ?? ""}.${match.number}`;
					} else if (
						bracket.type === "single_elimination" ||
						bracket.type === "double_elimination"
					) {
						const rounds =
							bracket.type === "single_elimination"
								? getRounds({ type: "single", bracketData: bracket.data })
								: [
										...getRounds({
											type: "winners",
											bracketData: bracket.data,
										}),
										...getRounds({ type: "losers", bracketData: bracket.data }),
									];

						const round = rounds.find((round) => round.id === match.round_id);

						if (round) {
							const specifier = () => {
								if (
									[
										"WB Finals",
										"Grand Finals",
										"Bracket Reset",
										"Finals",
										"LB Finals",
										"LB Semis",
										"3rd place match",
									].includes(round.name)
								) {
									return "";
								}

								const roundNameEndsInDigit = /\d$/.test(round.name);

								if (!roundNameEndsInDigit) {
									return ` ${match.number}`;
								}

								return `.${match.number}`;
							};
							roundName = `${round.name}${specifier()}`;
						}
					} else {
						assertUnreachable(bracket.type);
					}
				}
			}
		}

		return {
			bracketName,
			roundName,
		};
	}, [tournament, data.match.id]);

	return (
		<div className="line-height-tight" data-testid="match-header">
			<h2 className="text-lg">{roundName}</h2>
			{tournament.ctx.settings.bracketProgression.length > 1 ? (
				<div className="text-lighter text-xs font-bold">{bracketName}</div>
			) : null}
		</div>
	);
}

function AutoRefresher() {
	useAutoRefresh();

	return null;
}

function useAutoRefresh() {
	const { revalidate } = useRevalidator();
	const tournament = useTournament();
	const data = useLoaderData<typeof loader>();
	const lastEventId = useEventSource(
		tournamentMatchSubscribePage({
			tournamentId: tournament.ctx.id,
			matchId: data.match.id,
		}),
		{
			event: matchSubscriptionKey(data.match.id),
		},
	);

	React.useEffect(() => {
		if (lastEventId) {
			revalidate();
		}
	}, [lastEventId, revalidate]);
}

function MapListSection({
	teams,
	type,
}: {
	teams: [id: number, id: number];
	type: "EDIT" | "OTHER";
}) {
	const data = useLoaderData<typeof loader>();
	const tournament = useTournament();

	const teamOneId = teams[0];
	const teamOne = React.useMemo(
		() => tournament.teamById(teamOneId),
		[teamOneId, tournament],
	);
	const teamTwoId = teams[1];
	const teamTwo = React.useMemo(
		() => tournament.teamById(teamTwoId),
		[teamTwoId, tournament],
	);

	if (!teamOne || !teamTwo) return null;

	invariant(data.mapList, "No mapList found for this map list");

	const scoreSum =
		(data.match.opponentOne?.score ?? 0) + (data.match.opponentTwo?.score ?? 0);

	const currentMap = data.mapList?.filter((m) => !m.bannedByTournamentTeamId)[
		scoreSum
	];

	return (
		<StartedMatch
			currentStageWithMode={currentMap}
			teams={[teamOne, teamTwo]}
			type={type}
		/>
	);
}

function ResultsSection() {
	const data = useLoaderData<typeof loader>();
	const tournament = useTournament();
	const [selectedResultIndex, setSelectedResultIndex] = useSearchParamState({
		defaultValue: data.results.length - 1,
		name: "result",
		revive: (value) => {
			const maybeIndex = Number(value);
			if (!Number.isInteger(maybeIndex)) return;
			if (maybeIndex < 0 || maybeIndex >= data.results.length) return;

			return maybeIndex;
		},
	});

	const result = data.results[selectedResultIndex];
	invariant(result, "Result is missing");

	const teamOne = data.match.opponentOne?.id
		? tournament.teamById(data.match.opponentOne.id)
		: undefined;
	const teamTwo = data.match.opponentTwo?.id
		? tournament.teamById(data.match.opponentTwo.id)
		: undefined;

	if (!teamOne || !teamTwo) {
		throw new Error("Team is missing");
	}

	const resultSource = data.mapList?.find(
		(m) => m.stageId === result.stageId && m.mode === result.mode,
	)?.source;

	return (
		<StartedMatch
			currentStageWithMode={{ ...result, source: resultSource ?? "TO" }}
			teams={[teamOne, teamTwo]}
			selectedResultIndex={selectedResultIndex}
			setSelectedResultIndex={setSelectedResultIndex}
			result={result}
			type="OTHER"
		/>
	);
}
