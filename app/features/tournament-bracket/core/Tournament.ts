import type {
	Tables,
	TournamentStage,
	TournamentStageSettings,
} from "~/db/tables";
import {
	LEAGUES,
	TOURNAMENT,
} from "~/features/tournament/tournament-constants";
import {
	modesIncluded,
	tournamentIsRanked,
} from "~/features/tournament/tournament-utils";
import type * as Progression from "~/features/tournament-bracket/core/Progression";
import type { TournamentManagerDataSet } from "~/modules/brackets-manager/types";
import type { Match, Stage } from "~/modules/brackets-model";
import type { ModeShort } from "~/modules/in-game-lists/types";
import { isAdmin } from "~/modules/permissions/utils";
import {
	databaseTimestampNow,
	databaseTimestampToDate,
	dateToDatabaseTimestamp,
} from "~/utils/dates";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";
import { assertUnreachable } from "~/utils/types";
import { userSubmittedImage } from "~/utils/urls-img";
import {
	fillWithNullTillPowerOfTwo,
	groupNumberToLetters,
} from "../tournament-bracket-utils";
import { Bracket } from "./Bracket";
import { getTournamentManager } from "./brackets-manager";
import { getRounds } from "./rounds";
import * as Swiss from "./Swiss";
import type { TournamentData, TournamentDataTeam } from "./Tournament.server";

export type OptionalIdObject = { id: number } | undefined;

/** Extends and providers utility functions on top of the bracket-manager library. Updating data after the bracket has started is responsibility of bracket-manager. */
export class Tournament {
	brackets: Bracket[] = [];
	ctx;
	simulateBrackets;

	constructor({
		data,
		ctx,
		simulateBrackets = true,
	}: {
		data: TournamentData["data"];
		ctx: TournamentData["ctx"];
		/** Should the bracket results be simulated (showing how teams are expected to advance), skipping it is a performance optimization if it's not needed */
		simulateBrackets?: boolean;
	}) {
		const hasStarted = data.stage.length > 0;

		const teamsInSeedOrder = ctx.teams.sort((a, b) => {
			if (a.seed && b.seed) {
				return a.seed - b.seed;
			}

			if (a.seed && !b.seed) {
				return -1;
			}

			if (!a.seed && b.seed) {
				return 1;
			}

			return this.compareUnseededTeams(
				a,
				b,
				ctx.settings.minMembersPerTeam ?? 4,
			);
		});
		this.simulateBrackets = simulateBrackets;
		this.ctx = {
			...ctx,
			teams: hasStarted
				? // after the start the teams who did not check-in are irrelevant
					teamsInSeedOrder.filter((team) => team.checkIns.length > 0)
				: teamsInSeedOrder,
			startTime: databaseTimestampToDate(ctx.startTime),
		};

		this.initBrackets(data);
	}

	private compareUnseededTeams(
		a: TournamentData["ctx"]["teams"][number],
		b: TournamentData["ctx"]["teams"][number],
		minMembersPerTeam: number,
	) {
		const aIsFull = a.members.length >= minMembersPerTeam;
		const bIsFull = b.members.length >= minMembersPerTeam;

		if (aIsFull && !bIsFull) {
			return -1;
		}

		if (!aIsFull && bIsFull) {
			return 1;
		}

		if (a.avgSeedingSkillOrdinal && b.avgSeedingSkillOrdinal) {
			return b.avgSeedingSkillOrdinal - a.avgSeedingSkillOrdinal;
		}

		if (a.avgSeedingSkillOrdinal && !b.avgSeedingSkillOrdinal) {
			return -1;
		}

		if (!a.avgSeedingSkillOrdinal && b.avgSeedingSkillOrdinal) {
			return 1;
		}

		return a.createdAt - b.createdAt;
	}

	private initBrackets(data: TournamentManagerDataSet) {
		for (const [
			bracketIdx,
			{
				type,
				name,
				sources,
				requiresCheckIn = false,
				startTime = null,
				settings,
			},
		] of this.ctx.settings.bracketProgression.entries()) {
			const inProgressStage = data.stage.find((stage) => stage.name === name);

			if (inProgressStage) {
				const match = data.match.filter(
					(match) => match.stage_id === inProgressStage.id,
				);

				this.brackets.push(
					Bracket.create({
						id: inProgressStage.id,
						idx: bracketIdx,
						tournament: this,
						preview: false,
						name,
						sources,
						createdAt: inProgressStage.createdAt,
						requiresCheckIn,
						startTime: startTime ? databaseTimestampToDate(startTime) : null,
						settings: settings ?? null,
						data: {
							...data,
							group: data.group.filter(
								(group) => group.stage_id === inProgressStage.id,
							),
							match,
							stage: data.stage.filter(
								(stage) => stage.id === inProgressStage.id,
							),
							round: data.round.filter(
								(round) => round.stage_id === inProgressStage.id,
							),
						},
						type,
					}),
				);
			} else if (type === "swiss") {
				const { teams, relevantMatchesFinished } = sources
					? this.resolveTeamsFromSources(sources, bracketIdx)
					: this.resolveTeamsFromSignups(bracketIdx);

				const { checkedInTeams, notCheckedInTeams } =
					this.divideTeamsToCheckedInAndNotCheckedIn({
						teams,
						bracketIdx,
						usesRegularCheckIn: !sources,
						requiresCheckIn,
					});

				this.brackets.push(
					Bracket.create({
						id: -1 * bracketIdx,
						idx: bracketIdx,
						tournament: this,
						seeding: checkedInTeams,
						preview: true,
						name,
						requiresCheckIn,
						startTime: startTime ? databaseTimestampToDate(startTime) : null,
						settings: settings ?? null,
						data: Swiss.create({
							tournamentId: this.ctx.id,
							name,
							seeding: checkedInTeams,
							settings: this.bracketManagerSettings(
								settings,
								type,
								checkedInTeams.length,
							),
						}),
						type,
						sources,
						createdAt: null,
						canBeStarted:
							(!startTime || startTime < databaseTimestampNow()) &&
							checkedInTeams.length >= TOURNAMENT.ENOUGH_TEAMS_TO_START &&
							(sources ? relevantMatchesFinished : this.regularCheckInHasEnded),
						teamsPendingCheckIn:
							bracketIdx !== 0 ? notCheckedInTeams : undefined,
					}),
				);
			} else {
				const { teams, relevantMatchesFinished } = sources
					? this.resolveTeamsFromSources(sources, bracketIdx)
					: this.resolveTeamsFromSignups(bracketIdx);

				const { checkedInTeams, notCheckedInTeams } =
					this.divideTeamsToCheckedInAndNotCheckedIn({
						teams,
						bracketIdx,
						usesRegularCheckIn: !sources,
						requiresCheckIn,
					});

				const checkedInTeamsWithReplaysAvoided =
					this.avoidReplaysOfPreviousBracketOpponent(
						checkedInTeams,
						{
							sources,
							type,
						},
						settings,
					);

				this.brackets.push(
					Bracket.create({
						id: -1 * bracketIdx,
						idx: bracketIdx,
						tournament: this,
						seeding: checkedInTeamsWithReplaysAvoided,
						preview: true,
						name,
						requiresCheckIn,
						startTime: startTime ? databaseTimestampToDate(startTime) : null,
						settings: settings ?? null,
						type,
						sources,
						createdAt: null,
						canBeStarted:
							(!startTime || startTime < databaseTimestampNow()) &&
							checkedInTeamsWithReplaysAvoided.length >=
								TOURNAMENT.ENOUGH_TEAMS_TO_START &&
							(sources ? relevantMatchesFinished : this.regularCheckInHasEnded),
						teamsPendingCheckIn:
							bracketIdx !== 0 ? notCheckedInTeams : undefined,
					}),
				);
			}
		}
	}

	private resolveTeamsFromSources(
		sources: NonNullable<Progression.ParsedBracket["sources"]>,
		bracketIdx: number,
	) {
		const teams: number[] = [];

		let allRelevantMatchesFinished = true;
		for (const source of sources) {
			const sourceBracket = this.bracketByIdx(source.bracketIdx);
			invariant(sourceBracket, "Bracket not found");

			const { teams: sourcedTeams, relevantMatchesFinished } =
				sourceBracket.source(source.placements);
			if (!relevantMatchesFinished) {
				allRelevantMatchesFinished = false;
			}

			// exclude teams that would be going to this bracket according
			// to the bracket progression rules, but have been overridden
			// by the TO to go somewhere else or get eliminated (in the case of destinationBracketIdx = -1)
			const withOverriddenTeamsExcluded = sourcedTeams.filter(
				(teamId) =>
					!this.ctx.bracketProgressionOverrides.some(
						(override) =>
							override.sourceBracketIdx === source.bracketIdx &&
							override.tournamentTeamId === teamId &&
							override.destinationBracketIdx !== bracketIdx,
					),
			);

			teams.push(...withOverriddenTeamsExcluded);
		}

		const teamsFromOverride: { id: number; sourceBracketIdx: number }[] = [];
		for (const source of sources) {
			for (const override of this.ctx.bracketProgressionOverrides) {
				if (
					override.sourceBracketIdx !== source.bracketIdx ||
					override.destinationBracketIdx !== bracketIdx
				) {
					continue;
				}

				teamsFromOverride.push({
					id: override.tournamentTeamId,
					sourceBracketIdx: source.bracketIdx,
				});
			}
		}

		const overridesWithoutRepeats = teamsFromOverride
			.filter(({ id }) => !teams.includes(id))
			.sort((a, b) => {
				if (a.sourceBracketIdx !== b.sourceBracketIdx) return 0;

				const bracket = this.bracketByIdx(a.sourceBracketIdx);
				if (!bracket) return 0;

				const aStanding = bracket.standings.find(
					(standing) => standing.team.id === a.id,
				);
				const bStanding = bracket.standings.find(
					(standing) => standing.team.id === b.id,
				);

				if (!aStanding || !bStanding) return 0;

				return aStanding.placement - bStanding.placement;
			})
			.map(({ id }) => id);

		return {
			teams: teams.concat(overridesWithoutRepeats),
			relevantMatchesFinished: allRelevantMatchesFinished,
		};
	}

	private resolveTeamsFromSignups(bracketIdx: number) {
		const teams = this.isMultiStartingBracket
			? this.ctx.teams.filter((team) => {
					// 0 is the default
					if (typeof team.startingBracketIdx !== "number") {
						return bracketIdx === 0;
					}

					const startingBracket = this.ctx.settings.bracketProgression.at(
						team.startingBracketIdx,
					);
					if (!startingBracket || startingBracket.sources) {
						logger.warn(
							"resolveTeamsFromSignups: Starting bracket index invalid",
						);
						return bracketIdx === 0;
					}

					return team.startingBracketIdx === bracketIdx;
				})
			: this.ctx.teams;

		return {
			teams: teams.map((team) => team.id),
			relevantMatchesFinished: true,
		};
	}

	private avoidReplaysOfPreviousBracketOpponent(
		teams: number[],
		bracket: {
			sources: Progression.ParsedBracket["sources"];
			type: Tables["TournamentStage"]["type"];
		},
		settings: TournamentStageSettings,
	) {
		// rather arbitrary limit, but with smaller brackets avoiding replays is not possible
		// and then later while loop hits iteration limit
		if (teams.length < 8) return teams;

		// can't have replays from previous brackets in the first bracket
		// & no support yet for avoiding replays if many sources
		if (bracket.sources?.length !== 1) return teams;

		const sourceBracket = this.bracketByIdx(bracket.sources[0].bracketIdx);
		if (!sourceBracket) {
			logger.warn(
				"avoidReplaysOfPreviousBracketOpponent: Source bracket not found",
			);
			return teams;
		}

		// should not happen but just in case
		if (bracket.type === "round_robin" || bracket.type === "swiss") {
			return teams;
		}

		const sourceBracketEncounters = sourceBracket.data.match.reduce(
			(acc, cur) => {
				const oneId = cur.opponent1?.id;
				const twoId = cur.opponent2?.id;

				if (typeof oneId !== "number" || typeof twoId !== "number") return acc;

				if (!acc.has(oneId)) {
					acc.set(oneId, []);
				}
				if (!acc.has(twoId)) {
					acc.set(twoId, []);
				}
				acc.get(oneId)!.push(twoId);
				acc.get(twoId)!.push(oneId);
				return acc;
			},
			new Map() as Map<number, number[]>,
		);

		const bracketReplays = (candidateTeams: number[]) => {
			const manager = getTournamentManager();
			manager.create({
				tournamentId: this.ctx.id,
				name: "X",
				type: bracket.type as Exclude<
					TournamentStage["type"],
					"round_robin" | "swiss"
				>,
				seeding: fillWithNullTillPowerOfTwo(candidateTeams),
				settings: this.bracketManagerSettings(
					settings,
					bracket.type,
					candidateTeams.length,
				),
			});

			const matches = manager.get.tournamentData(this.ctx.id).match;
			const replays: [number, number][] = [];
			for (const match of matches) {
				if (!match.opponent1?.id || !match.opponent2?.id) continue;

				if (
					sourceBracketEncounters
						.get(match.opponent1.id)
						?.includes(match.opponent2.id)
				) {
					replays.push([match.opponent1.id, match.opponent2.id]);
				}
			}

			return replays;
		};

		const newOrder = [...teams];
		// TODO: handle also e.g. top 3 of each group in the bracket
		// only switch around 2nd seeds
		const potentialSwitchCandidates = teams.slice(Math.floor(teams.length / 2));
		let replays = bracketReplays(newOrder);
		let iterations = 0;
		while (replays.length > 0) {
			iterations++;
			if (iterations > 100) {
				logger.warn(
					"avoidReplaysOfPreviousBracketOpponent: Avoiding replays failed, too many iterations",
				);

				return teams;
			}

			const [oneId, twoId] = replays[0];

			const lowerSeedId =
				newOrder.findIndex((t) => t === oneId) <
				newOrder.findIndex((t) => t === twoId)
					? twoId
					: oneId;

			if (!potentialSwitchCandidates.some((t) => t === lowerSeedId)) {
				logger.warn(
					`Avoiding replays failed, no potential switch candidates found in match: ${oneId} vs. ${twoId}`,
				);

				return teams;
			}

			for (const candidate of potentialSwitchCandidates) {
				// can't switch place with itself
				if (candidate === lowerSeedId) continue;

				const candidateIdx = newOrder.findIndex((t) => t === candidate);
				const otherIdx = newOrder.findIndex((t) => t === lowerSeedId);

				const temp = newOrder[candidateIdx];
				newOrder[candidateIdx] = newOrder[otherIdx];
				newOrder[otherIdx] = temp;

				const oldReplayCount = replays.length;
				const newReplays = bracketReplays(newOrder);
				if (newReplays.length < oldReplayCount) {
					replays = newReplays;
					break;
				}

				{
					// revert the switch
					const temp = newOrder[candidateIdx];
					newOrder[candidateIdx] = newOrder[otherIdx];
					newOrder[otherIdx] = temp;
				}
			}
		}

		return newOrder;
	}

	private divideTeamsToCheckedInAndNotCheckedIn({
		teams,
		bracketIdx,
		usesRegularCheckIn,
		requiresCheckIn,
	}: {
		teams: number[];
		bracketIdx: number;
		usesRegularCheckIn: boolean;
		requiresCheckIn: boolean;
	}) {
		return teams.reduce(
			(acc, cur) => {
				const team = this.teamById(cur);
				invariant(team, "Team not found");

				if (usesRegularCheckIn) {
					if (team.checkIns.length > 0 || !this.regularCheckInStartInThePast) {
						acc.checkedInTeams.push(cur);
					} else {
						acc.notCheckedInTeams.push(cur);
					}
				} else if (requiresCheckIn) {
					const isCheckedIn = team.checkIns.some(
						(checkIn) =>
							checkIn.bracketIdx === bracketIdx && !checkIn.isCheckOut,
					);

					if (isCheckedIn) {
						acc.checkedInTeams.push(cur);
					} else {
						acc.notCheckedInTeams.push(cur);
					}
				} else {
					const isCheckedOut = team.checkIns.some(
						(checkIn) =>
							checkIn.bracketIdx === bracketIdx && checkIn.isCheckOut,
					);

					if (isCheckedOut) {
						acc.notCheckedInTeams.push(cur);
					} else {
						acc.checkedInTeams.push(cur);
					}
				}

				return acc;
			},
			{ checkedInTeams: [], notCheckedInTeams: [] } as {
				checkedInTeams: number[];
				notCheckedInTeams: number[];
			},
		);
	}

	/** Provides settings for the brackets-manager module with our selected defaults */
	bracketManagerSettings(
		selectedSettings: TournamentStageSettings | null,
		type: Tables["TournamentStage"]["type"],
		participantsCount: number,
	): Stage["settings"] {
		switch (type) {
			case "single_elimination": {
				if (participantsCount < 4) {
					return { consolationFinal: false };
				}

				return {
					consolationFinal:
						selectedSettings?.thirdPlaceMatch ??
						TOURNAMENT.SE_DEFAULT_HAS_THIRD_PLACE_MATCH,
				};
			}
			case "double_elimination": {
				return {
					grandFinal: "double",
				};
			}
			case "round_robin": {
				const teamsPerGroup =
					selectedSettings?.teamsPerGroup ??
					TOURNAMENT.RR_DEFAULT_TEAM_COUNT_PER_GROUP;

				return {
					groupCount: Math.ceil(participantsCount / teamsPerGroup),
					seedOrdering: ["groups.seed_optimized"],
				};
			}
			case "swiss": {
				return {
					swiss:
						selectedSettings?.groupCount && selectedSettings.roundCount
							? {
									groupCount: selectedSettings.groupCount,
									roundCount: selectedSettings.roundCount,
								}
							: {
									groupCount: TOURNAMENT.SWISS_DEFAULT_GROUP_COUNT,
									roundCount: TOURNAMENT.SWISS_DEFAULT_ROUND_COUNT,
								},
				};
			}
			default: {
				assertUnreachable(type);
			}
		}
	}

	/** Is tournament ranked (affects SP/Skill). For tournament to be ranked the organizer needs to enable it and it needs to fit the conditions e.g. it needs to happen when a ranked season is active. */
	get ranked() {
		return tournamentIsRanked({
			isSetAsRanked: this.ctx.settings.isRanked,
			startTime: this.ctx.startTime,
			minMembersPerTeam: this.minMembersPerTeam,
			isTest: this.isTest,
		});
	}

	/** Run as test tournament which don't show on calendar, give out results etc., default false */
	get isTest() {
		return this.ctx.settings.isTest ?? false;
	}

	/** What seeding skill rating this tournament counts for */
	get skillCountsFor() {
		if (this.ranked) {
			return "RANKED";
		}

		// exclude gimmicky tournaments
		if (this.minMembersPerTeam === 4 && !this.ctx.tags?.includes("SPECIAL")) {
			return "UNRANKED";
		}

		return null;
	}

	/** What is the format of the tournament 4v4 (default), 3v3, 2v2 or 1v1. */
	get minMembersPerTeam() {
		return this.ctx.settings.minMembersPerTeam ?? 4;
	}

	/** Do teams need to pick map during registration, or is this TO's responsibility */
	get teamsPrePickMaps() {
		return this.ctx.mapPickingStyle !== "TO";
	}

	/** What Splatoon modes are played in this tournament */
	get modesIncluded(): ModeShort[] {
		return modesIncluded(this.ctx.mapPickingStyle, this.ctx.toSetMapPool);
	}

	/** Tournament teams logo image path, either from the team or the pickup avatar uploaded specifically for this tournament */
	tournamentTeamLogoSrc(team: TournamentDataTeam) {
		const url = team.team?.logoUrl ?? team.pickupAvatarUrl;

		if (!url) return;

		return userSubmittedImage(url);
	}

	/** Generates a Splatoon 3 pool code to join the tournament match. It tries to make it so that teams don't need to change the pool all the time, but provides different ones not to run into the in-game limit of max people in a pool at a time. */
	resolvePoolCode({
		hostingTeamId,
		groupLetters,
		bracketNumber,
	}: {
		hostingTeamId: number;
		groupLetters?: string;
		bracketNumber?: number;
	}) {
		const tournamentNameWithoutOnlyLetters = this.ctx.name.replace(
			/[^a-zA-Z ]/g,
			"",
		);
		let prefix = tournamentNameWithoutOnlyLetters
			.split(" ")
			.map((word) => word[0])
			.join("")
			.toUpperCase()
			.slice(0, 3);

		// handle tournament name not having letters by using a default prefix
		if (!prefix) {
			prefix = ["AB", "CD", "EF", "GH", "IJ", "KL", "MN", "OP", "QR", "ST"][
				this.ctx.id % 10
			];
		}

		// for small tournaments there should be no risk that the pool gets full
		// so to make it more convenient just use same suffix every match
		const globalSuffix = this.ctx.teams.length <= 20 ? this.ctx.id % 10 : null;

		return {
			prefix,
			suffix:
				globalSuffix ?? groupLetters ?? bracketNumber ?? hostingTeamId % 10,
		};
	}

	/** Has tournament started, meaning that at least one bracket has started. Also finalized tournaments are considered started. */
	get hasStarted() {
		return this.brackets.some((bracket) => !bracket.preview);
	}

	/** Is every bracket over (bracket is over when every match is over). */
	get everyBracketOver() {
		if (this.ctx.isFinalized) return true;

		return this.brackets.every((bracket) => bracket.everyMatchOver);
	}

	teamById(id: number) {
		const teamIdx = this.ctx.teams.findIndex((team) => team.id === id);

		if (teamIdx === -1) return;

		return { ...this.ctx.teams[teamIdx], seed: teamIdx + 1 };
	}

	participatedPlayersByTeamId(id: number) {
		const team = this.teamById(id);
		invariant(team, "Team not found");

		return team.members.filter((member) =>
			this.ctx.participatedUsers.includes(member.userId),
		);
	}

	matchIdToBracketIdx(matchId: number) {
		const idx = this.brackets.findIndex((bracket) =>
			bracket.data.match.some((match) => match.id === matchId),
		);

		if (idx === -1) return null;

		return idx;
	}

	/** Should it be possible for the given user to finalize this tournament at this time? */
	canFinalize(user: OptionalIdObject) {
		// can skip underground bracket
		const relevantBrackets = this.brackets.filter(
			(b) => !b.preview || !b.isUnderground,
		);

		const everyRoundHasMatches = () => {
			// only in swiss matches get generated as tournament progresses
			if (
				this.ctx.settings.bracketProgression.length > 1 ||
				this.ctx.settings.bracketProgression[0].type !== "swiss"
			) {
				return true;
			}

			return this.brackets[0].data.round.every((round) => {
				const hasMatches = this.brackets[0].data.match.some(
					(match) => match.round_id === round.id,
				);

				return hasMatches;
			});
		};

		return (
			everyRoundHasMatches() &&
			relevantBrackets.every((b) => b.everyMatchOver) &&
			this.isOrganizer(user) &&
			!this.ctx.isFinalized
		);
	}

	/** Should it be possible for the given user to report score for this match at this time? */
	canReportScore({
		matchId,
		user,
	}: {
		matchId: number;
		user: OptionalIdObject;
	}) {
		const match = this.brackets
			.flatMap((bracket) => (bracket.preview ? [] : bracket.data.match))
			.find((match) => match.id === matchId);
		invariant(match, "Match not found");

		// match didn't start yet
		if (!match.opponent1 || !match.opponent2) return false;

		const matchIsOver =
			match.opponent1.result === "win" || match.opponent2.result === "win";

		if (matchIsOver) return false;

		const teamMemberOf = this.teamMemberOfByUser(user)?.id;

		const isParticipant =
			match.opponent1.id === teamMemberOf ||
			match.opponent2.id === teamMemberOf;

		return isParticipant || this.isOrganizer(user);
	}

	/**
	 * Checks if a team fulfills all the conditions to check-in. Returns the reason, if not.
	 */
	checkInConditionsFulfilledByTeamId(tournamentTeamId: number) {
		const team = this.teamById(tournamentTeamId);
		invariant(team, "Team not found");

		if (!this.regularCheckInIsOpen && !this.regularCheckInHasEnded) {
			return { isFulfilled: false, reason: "Check in has not yet started" };
		}

		if (team.members.length < this.minMembersPerTeam) {
			return {
				isFulfilled: false,
				reason: `Team needs at least ${this.minMembersPerTeam} members`,
			};
		}

		if (this.teamsPrePickMaps && (!team.mapPool || team.mapPool.length === 0)) {
			return { isFulfilled: false, reason: "Team has no map pool set" };
		}

		return { isFulfilled: true, reason: null };
	}

	/** Is the tournament invitational meaning the organizer adds all teams and there is no public registration. */
	get isInvitational() {
		return this.ctx.settings.isInvitational ?? false;
	}

	/** Does this tournament have the option for teams to sign up as subs? Subs is a solo sign-up that teams can ask to join their team if they need more players. */
	get subsFeatureEnabled() {
		return this.ctx.settings.enableSubs ?? true;
	}

	/** Can a new sub post be made at this time? */
	get canAddNewSubPost() {
		if (!this.subsFeatureEnabled) return false;

		return (
			!this.ctx.settings.regClosesAt ||
			this.ctx.settings.regClosesAt ===
				dateToDatabaseTimestamp(this.ctx.startTime) ||
			this.registrationOpen
		);
	}

	/** what is the max amount of members teams can add in total? This limit doesn't apply to the organizer adding members to a team. */
	get maxTeamMemberCount() {
		// special format
		if (this.minMembersPerTeam !== 4) return this.minMembersPerTeam;

		if (this.isLeagueSignup || this.isLeagueDivision) return 8;

		// TODO: retire this hack by making it user configurable
		if (this.ctx.organization?.id === 19 && this.ctx.name.includes("FLUTI")) {
			return 8;
		}

		const maxMembersBeforeStart = 6;

		if (this.hasStarted) {
			return maxMembersBeforeStart + 1;
		}

		return maxMembersBeforeStart;
	}

	/** Is the regular check-in (check-in for the whole tournament) open at this time? */
	get regularCheckInIsOpen() {
		return (
			this.regularCheckInStartsAt < new Date() &&
			this.regularCheckInEndsAt > new Date()
		);
	}

	/** Has the regular check-in (check-in for the whole tournament) ended? */
	get regularCheckInHasEnded() {
		return this.ctx.startTime < new Date();
	}

	/** Has the regular check-in (check-in for the whole tournament) started? Note it is also considered started if it has ended. */
	get regularCheckInStartInThePast() {
		return this.regularCheckInStartsAt < new Date();
	}

	/** Date when the regular check-in is scheduled to start. */
	get regularCheckInStartsAt() {
		const result = new Date(this.ctx.startTime);
		result.setMinutes(result.getMinutes() - 60);
		return result;
	}

	/** Date when the regular check-in is scheduled to start. */
	get regularCheckInEndsAt() {
		return this.ctx.startTime;
	}

	/** Date when the tournament registration is scheduled to end. This can be set by the organizer. */
	get registrationClosesAt() {
		return this.ctx.settings.regClosesAt
			? databaseTimestampToDate(this.ctx.settings.regClosesAt)
			: this.ctx.startTime;
	}

	/** Is the tournament registration open at this time? */
	get registrationOpen() {
		if (this.isInvitational) return false;

		return this.registrationClosesAt > new Date();
	}

	/**
	 * Does this tournament have autonomous subs feature enabled?
	 * If enabled, teams can add members to their roster while tournament is in progress without having to request the organizer to do it.
	 * */
	get autonomousSubs() {
		return this.ctx.settings.autonomousSubs ?? true;
	}

	/**
	 * Is this tournament a league sign-up? League sign-up tournament is a special case which just exists for registration.
	 * It won't have brackets.
	 * */
	get isLeagueSignup() {
		return Object.values(LEAGUES)
			.flat()
			.some((entry) => entry.tournamentId === this.ctx.id);
	}

	/** Is this tournament a league division? League division is a normal tournament that connects to a league sign-up tournament where teams are sourced from. */
	get isLeagueDivision() {
		return Boolean(this.ctx.parentTournamentId);
	}

	/** Does this tournament have many brackets that act as the first bracket? In this format many bracket progressions advance independently from each other (so not all teams can meet). */
	get isMultiStartingBracket() {
		let count = 0;
		for (const bracket of this.ctx.settings.bracketProgression) {
			if (!bracket.sources) count++;
		}

		return count > 1;
	}

	/** Returns the bracket and round names for the given match ID.
	 * @example
	 * tournament.matchNameById(123) // { bracketName: "Groups Stage", roundName: "Round 1.1", roundNameWithoutMatchIdentifier: "Round 1" }
	 */
	matchContextNamesById(matchId: number) {
		let bracketName: string | undefined;
		let roundName: string | undefined;

		for (const bracket of this.brackets) {
			if (bracket.preview) continue;

			for (const match of bracket.data.match) {
				if (match.id === matchId) {
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
										TOURNAMENT.ROUND_NAMES.WB_FINALS,
										TOURNAMENT.ROUND_NAMES.GRAND_FINALS,
										TOURNAMENT.ROUND_NAMES.BRACKET_RESET,
										TOURNAMENT.ROUND_NAMES.FINALS,
										TOURNAMENT.ROUND_NAMES.LB_FINALS,
										TOURNAMENT.ROUND_NAMES.LB_SEMIS,
										TOURNAMENT.ROUND_NAMES.THIRD_PLACE_MATCH,
									].includes(round.name as any)
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

		const roundNameWithoutMatchIdentifier = (roundName?: string) => {
			if (!roundName) return;

			if (roundName.includes("Semis")) {
				return roundName.replace(/\d/g, "").trim();
			}

			return roundName.split(".")[0];
		};

		return {
			bracketName,
			roundName,
			roundNameWithoutMatchIdentifier:
				roundNameWithoutMatchIdentifier(roundName),
		};
	}

	/** Returns a `Bracket` with the given index or the first bracket if not found. */
	bracketByIdxOrDefault(idx: number): Bracket {
		const bracket = this.brackets[idx];
		if (bracket) return bracket;

		const defaultBracket = this.brackets[0];
		invariant(defaultBracket, "No brackets found");

		logger.warn("Bracket not found, using fallback bracket");
		return defaultBracket;
	}

	/** Returns a `Bracket` with the given index or null if not found. */
	bracketByIdx(idx: number) {
		const bracket = this.brackets[idx];
		if (!bracket) return null;

		return bracket;
	}

	/** Returns the team that the user is the owner of, or null if not found. Includes invite code (only owner should see this, logic in the loader function). */
	ownedTeamByUser(
		user: OptionalIdObject,
	): ((typeof this.ctx.teams)[number] & { inviteCode: string }) | null {
		if (!user) return null;

		return this.ctx.teams.find((team) =>
			team.members.some(
				(member) => member.userId === user.id && member.isOwner,
			),
		) as (typeof this.ctx.teams)[number] & { inviteCode: string };
	}

	/**
	 * Returns the team that the user is a member of, or null if not found.
	 * Note that user can be a member of multiple teams, this returns the team that the user joined most recently.
	 */
	teamMemberOfByUser(user: OptionalIdObject) {
		if (!user) return null;

		const teams = this.ctx.teams.filter((team) =>
			team.members.some((member) => member.userId === user.id),
		);

		let result: (typeof teams)[number] | null = null;
		let latestCreatedAt = 0;
		for (const team of teams) {
			const member = team.members.find((member) => member.userId === user.id)!;

			if (member.createdAt > latestCreatedAt) {
				result = team;
				latestCreatedAt = member.createdAt;
			}
		}

		return result;
	}

	/**
	 * Returns the progress status of the user in the tournament, or null if not participating.
	 * e.g. might return "WAITING_FOR_MATCH" if the user is waiting for their next match or "WAITING_FOR_CAST" if the match is ready to be played but locked waiting for the cast.
	 */
	teamMemberOfProgressStatus(user: OptionalIdObject) {
		const team = this.teamMemberOfByUser(user);
		if (!team) return null;

		if (
			this.brackets.every((bracket) => bracket.preview) &&
			!this.regularCheckInIsOpen
		) {
			return null;
		}

		for (const bracket of this.brackets) {
			if (bracket.preview) continue;
			for (const match of bracket.data.match) {
				const isParticipant =
					match.opponent1?.id === team.id || match.opponent2?.id === team.id;
				const isNotFinished =
					match.opponent1 &&
					match.opponent2 &&
					match.opponent1?.result !== "win" &&
					match.opponent2?.result !== "win";
				const isWaitingForTeam =
					(match.opponent1 && match.opponent1.id === null) ||
					(match.opponent2 && match.opponent2.id === null);

				if (isParticipant && isNotFinished && !isWaitingForTeam) {
					const otherTeam = this.teamById(
						match.opponent1!.id === team.id
							? match.opponent2!.id!
							: match.opponent1!.id!,
					)!;

					const otherTeamBusyWithPreviousMatch =
						bracket.type === "round_robin" &&
						bracket.data.match.find(
							(match) =>
								(match.opponent1?.id === otherTeam.id ||
									match.opponent2?.id === otherTeam.id) &&
								match.opponent1?.result !== "win" &&
								match.opponent2?.result !== "win",
						)?.id !== match.id;

					if (otherTeamBusyWithPreviousMatch) {
						return { type: "WAITING_FOR_MATCH" } as const;
					}

					if (this.ctx.castedMatchesInfo?.lockedMatches.includes(match.id)) {
						return { type: "WAITING_FOR_CAST" } as const;
					}

					return {
						type: "MATCH",
						matchId: match.id,
						opponent: otherTeam.name,
					} as const;
				}

				if (isParticipant && isWaitingForTeam) {
					return { type: "WAITING_FOR_MATCH" } as const;
				}
			}
		}

		if (team.checkIns.length === 0 && this.regularCheckInIsOpen) {
			return {
				type: "CHECKIN",
				canCheckIn: this.checkInConditionsFulfilledByTeamId(team.id)
					.isFulfilled,
			} as const;
		}

		for (const [bracketIdx, bracket] of this.brackets.entries()) {
			if (bracket.teamsPendingCheckIn?.includes(team.id)) {
				return { type: "CHECKIN", bracketIdx } as const;
			}
		}

		for (const bracket of this.brackets) {
			if (!bracket.preview) continue;

			const isParticipant = bracket.seeding?.includes(team.id);

			if (isParticipant) {
				return { type: "WAITING_FOR_BRACKET" } as const;
			}
		}

		for (const bracket of this.brackets) {
			if (bracket.preview || bracket.type !== "swiss") continue;

			// TODO: both seeding and participantTournamentTeamIds are used for the same thing
			const isParticipant = bracket.participantTournamentTeamIds.includes(
				team.id,
			);

			const setsGeneratedCount = bracket.data.match.filter(
				(match) =>
					match.opponent1?.id === team.id || match.opponent2?.id === team.id,
			).length;
			const notAllRoundsGenerated =
				this.ctx.settings.swiss?.roundCount &&
				setsGeneratedCount !== this.ctx.settings.swiss?.roundCount;

			if (isParticipant && notAllRoundsGenerated) {
				return { type: "WAITING_FOR_ROUND" } as const;
			}
		}

		if (team.checkIns.length === 0) return null;

		return { type: "THANKS_FOR_PLAYING" } as const;
	}

	/**
	 * Can the given match be reopened? This is used to allow reopening matches were the wrong score was reported.
	 * In principle match can be reopened as long as no match that follows it has started.
	 */
	matchCanBeReopened(matchId: number) {
		if (this.ctx.isFinalized) return false;

		const allMatches = this.brackets.flatMap((bracket) =>
			// preview matches don't even have real id's and anyway don't prevent anything
			bracket.preview ? [] : bracket.data.match,
		);
		const match = allMatches.find((match) => match.id === matchId);
		if (!match) {
			logger.error("matchCanBeReopened: Match not found");
			return false;
		}

		const bracketIdx = this.matchIdToBracketIdx(matchId);

		if (typeof bracketIdx !== "number") {
			logger.error("matchCanBeReopened: Bracket not found");
			return false;
		}

		const bracket = this.bracketByIdx(bracketIdx);
		invariant(bracket, "Bracket not found");

		if (
			this.matchAffectsAnotherBracket({
				match,
				matchBracket: bracket,
				bracketIdx,
			})
		) {
			return false;
		}

		// BYE match
		if (!match.opponent1 || !match.opponent2) return false;

		const anotherMatchBlocking = this.followingMatches(matchId).some(
			(match) =>
				// in swiss matches are generated round by round and the existance
				// of a following match in itself is blocking even if they didn't start yet
				bracket.type === "swiss" ||
				// match is not in progress in un-swiss bracket, ok to reopen
				(match.opponent1?.score && match.opponent1.score > 0) ||
				(match.opponent2?.score && match.opponent2.score > 0),
		);

		return !anotherMatchBlocking;
	}

	private matchAffectsAnotherBracket({
		match,
		matchBracket,
		bracketIdx,
	}: {
		match: Match;
		matchBracket: Bracket;
		bracketIdx: number;
	}) {
		const ongoingFollowUpBrackets = this.brackets.filter(
			(b) => !b.preview && b.sources?.some((s) => s.bracketIdx === bracketIdx),
		);

		if (ongoingFollowUpBrackets.length === 0) return false;
		if (matchBracket.type === "round_robin" || matchBracket.type === "swiss") {
			return true;
		}

		const participantInAnotherBracket = ongoingFollowUpBrackets
			.flatMap((b) => b.participantTournamentTeamIds)
			.some(
				(tournamentTeamId) =>
					tournamentTeamId === match.opponent1?.id ||
					tournamentTeamId === match.opponent2?.id,
			);

		return participantInAnotherBracket;
	}

	/** Returns matches that follow the given match in the same bracket and stage, but only if they have the same participants and come after the given match. */
	followingMatches(matchId: number) {
		const match = this.brackets
			.flatMap((bracket) => bracket.data.match)
			.find((match) => match.id === matchId);
		if (!match) {
			logger.error("followingMatches: Match not found");
			return [];
		}
		const bracket = this.brackets.find((bracket) =>
			bracket.data.match.some((match) => match.id === matchId),
		);
		if (!bracket) {
			logger.error("followingMatches: Bracket not found");
			return [];
		}

		if (bracket.type === "round_robin") {
			return [];
		}

		return bracket.data.match
			.filter(
				// only interested in matches of the same bracket & not the match  itself
				(match2) =>
					match2.stage_id === match.stage_id && match2.id !== match.id,
			)
			.filter((match2) => {
				const hasSameParticipant =
					match2.opponent1?.id === match.opponent1?.id ||
					match2.opponent1?.id === match.opponent2?.id ||
					match2.opponent2?.id === match.opponent1?.id ||
					match2.opponent2?.id === match.opponent2?.id;

				const comesAfter =
					match2.group_id > match.group_id || match2.round_id > match.round_id;

				return hasSameParticipant && comesAfter;
			});
	}

	/** Checks if the given user is an admin of the tournament. */
	isAdmin(user: OptionalIdObject) {
		if (!user) return false;
		if (isAdmin(user)) return true;

		if (
			this.ctx.organization?.members.some(
				(member) => member.userId === user.id && member.role === "ADMIN",
			)
		) {
			return true;
		}

		return this.ctx.author.id === user.id;
	}

	/** Checks if the given user is an organizer of the tournament. */
	isOrganizer(user: OptionalIdObject) {
		if (!user) return false;
		if (isAdmin(user)) return true;

		if (this.ctx.author.id === user.id) return true;

		if (
			this.ctx.organization?.members.some(
				(member) =>
					member.userId === user.id &&
					["ADMIN", "ORGANIZER"].includes(member.role),
			)
		) {
			return true;
		}

		return this.ctx.staff.some(
			(staff) => staff.id === user.id && staff.role === "ORGANIZER",
		);
	}

	/** Checks if the given user is an organizer or streamer of the tournament. */
	isOrganizerOrStreamer(user: OptionalIdObject) {
		if (!user) return false;
		if (isAdmin(user)) return true;

		if (this.ctx.author.id === user.id) return true;

		if (
			this.ctx.organization?.members.some(
				(member) =>
					member.userId === user.id &&
					["ADMIN", "ORGANIZER", "STREAMER"].includes(member.role),
			)
		) {
			return true;
		}

		return this.ctx.staff.some(
			(staff) =>
				staff.id === user.id && ["ORGANIZER", "STREAMER"].includes(staff.role),
		);
	}
}
