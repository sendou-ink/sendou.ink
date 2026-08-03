import type { Tables } from "~/db/tables";
import {
	LEAGUES,
	TOURNAMENT,
} from "~/features/tournament/tournament-constants";
import {
	modesIncluded,
	sortTeamsBySeeding,
	tournamentInWeaponReportingWindow,
	tournamentIsRanked,
} from "~/features/tournament/tournament-utils";
import type { MatchData } from "~/features/tournament-bracket/core/engine/types";
import type * as Progression from "~/features/tournament-bracket/core/Progression";
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
import { groupNumberToLetters } from "../tournament-bracket-utils";
import { type Bracket, createBracket } from "./Bracket";
import { getRounds } from "./rounds";
import * as Seeding from "./Seeding";
import type { TournamentData, TournamentDataTeam } from "./Tournament.server";

export type OptionalIdObject = { id: number } | undefined;

/** The progress status of a team member in a running tournament, as resolved by {@link Tournament.teamMemberOfProgressStatus}. */
export type TournamentTeamMemberProgressStatus = NonNullable<
	ReturnType<Tournament["teamMemberOfProgressStatus"]>
>;

/** Extends and providers utility functions on top of the bracket-manager library. Updating data after the bracket has started is responsibility of bracket-manager. */
export class Tournament {
	ctx;
	private data;
	private _brackets: Array<Bracket | undefined> = [];
	private _allBrackets: Bracket[] | undefined;
	private bracketIdxsBeingBuilt = new Set<number>();

	constructor({
		data,
		ctx,
	}: {
		data: TournamentData["data"];
		ctx: TournamentData["ctx"];
	}) {
		const hasStarted = data.stage.length > 0;
		const minMembersPerTeam = ctx.settings.minMembersPerTeam ?? 4;

		const teamsInSeedOrder = sortTeamsBySeeding(ctx.teams, minMembersPerTeam);

		this.data = data;
		this.ctx = {
			...ctx,
			teams: hasStarted
				? // after the start the teams who did not check-in are irrelevant
					teamsInSeedOrder.filter((team) => team.checkIns.length > 0)
				: teamsInSeedOrder,
			startsAt: databaseTimestampToDate(ctx.startsAt),
		};
	}

	/**
	 * Every bracket of the tournament. Building a bracket is expensive (preview brackets
	 * are generated from scratch) so prefer {@link bracketByIdx} when only one is needed.
	 */
	get brackets(): Bracket[] {
		if (!this._allBrackets) {
			this._allBrackets = this.ctx.settings.bracketProgression.map(
				(_, bracketIdx) => this.builtBracketByIdx(bracketIdx),
			);
		}

		return this._allBrackets;
	}

	private builtBracketByIdx(bracketIdx: number): Bracket {
		const memoized = this._brackets[bracketIdx];
		if (memoized) return memoized;

		this.bracketIdxsBeingBuilt.add(bracketIdx);
		try {
			const bracket = this.buildBracket(bracketIdx);
			this._brackets[bracketIdx] = bracket;

			return bracket;
		} finally {
			this.bracketIdxsBeingBuilt.delete(bracketIdx);
		}
	}

	private buildBracket(bracketIdx: number): Bracket {
		const {
			type,
			name,
			sources,
			requiresCheckIn = false,
			startTime = null,
			settings,
		} = this.ctx.settings.bracketProgression[bracketIdx];

		const inProgressStage = this.data.stage.find(
			(stage) => stage.name === name,
		);

		if (inProgressStage) {
			return createBracket({
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
					...this.data,
					group: this.data.group.filter(
						(group) => group.stageId === inProgressStage.id,
					),
					match: this.data.match.filter(
						(match) => match.stageId === inProgressStage.id,
					),
					stage: this.data.stage.filter(
						(stage) => stage.id === inProgressStage.id,
					),
					round: this.data.round.filter(
						(round) => round.stageId === inProgressStage.id,
					),
				},
				type,
			});
		}

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

		const checkedInTeamsWithReplaysAvoided = this.followUpBracketSeeding(
			checkedInTeams,
			{
				sources,
				type,
			},
		);

		return createBracket({
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
			teamsPendingCheckIn: bracketIdx !== 0 ? notCheckedInTeams : undefined,
		});
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
				sourceBracket.source({
					placements: source.placements,
					advanceThreshold: sourceBracket.settings?.advanceThreshold,
					rest: source.rest,
				});
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

		// Filter out dropped teams from advancing to follow-up brackets
		const allTeams = teams.concat(overridesWithoutRepeats);
		const activeTeams = allTeams.filter((teamId) => {
			const team = this.teamById(teamId);
			return team && !team.droppedOut;
		});

		return {
			teams: activeTeams,
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

	private followUpBracketSeeding(
		teams: number[],
		bracket: {
			sources: Progression.ParsedBracket["sources"];
			type: Tables["TournamentStage"]["type"];
		},
	) {
		// nothing to adjust for starting brackets, and group stages pair via their own logic
		if (!bracket.sources || bracket.sources.length === 0) return teams;
		if (bracket.type === "round_robin" || bracket.type === "swiss") {
			return teams;
		}

		const sources: Seeding.FollowUpBracketSource[] = [];
		for (const source of bracket.sources) {
			const sourceBracket = this.bracketByIdx(source.bracketIdx);
			if (!sourceBracket) {
				logger.warn("followUpBracketSeeding: Source bracket not found");
				return teams;
			}

			const encounters: Array<[number, number]> = [];
			for (const match of sourceBracket.data.match) {
				const oneId = match.opponent1?.id;
				const twoId = match.opponent2?.id;
				if (typeof oneId !== "number" || typeof twoId !== "number") continue;

				encounters.push([oneId, twoId]);
			}

			sources.push({
				standings: sourceBracket.standings.map((standing) => ({
					tournamentTeamId: standing.team.id,
					placement: standing.placement,
					groupId: standing.groupId ?? null,
				})),
				encounters,
			});
		}

		return Seeding.forFollowUpBracket({ teams, sources });
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

	/** Is tournament ranked (affects SP/Skill). For tournament to be ranked the organizer needs to enable it and it needs to fit the conditions e.g. it needs to happen when a ranked season is active. */
	get ranked() {
		return tournamentIsRanked({
			isSetAsRanked: this.ctx.settings.isRanked,
			startsAt: this.ctx.startsAt,
			minMembersPerTeam: this.minMembersPerTeam,
			isTest: this.isTest,
		});
	}

	/** Run as test tournament which don't show on calendar, give out results etc., default false */
	get isTest() {
		return this.ctx.settings.isTest ?? false;
	}

	/** Draft tournament that is hidden during preparation, must be opened before bracket start */
	get isDraft() {
		return this.ctx.settings.isDraft ?? false;
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

	/** Should the rules page (and its nav item) be shown. True if there are rules or any map pool to show. */
	get hasRulesPage() {
		return (
			this.ctx.hasRules ||
			this.ctx.toSetMapPool.length > 0 ||
			this.ctx.tieBreakerMapPool.length > 0
		);
	}

	/** Tournament teams logo image path, either from the team or the pickup avatar uploaded specifically for this tournament */
	tournamentTeamLogoSrc(team: TournamentDataTeam) {
		return team.team?.logoUrl ?? team.pickupAvatarUrl;
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
		// pool numbers are kept in the 1-9 range (0 is not used)
		const globalSuffix =
			this.ctx.teams.length <= 20 ? (this.ctx.id % 9) + 1 : null;

		return {
			prefix,
			suffix:
				globalSuffix ??
				groupLetters ??
				bracketNumber ??
				(hostingTeamId % 9) + 1,
		};
	}

	/** Has tournament started, meaning that at least one bracket has started. Also finalized tournaments are considered started. */
	get hasStarted() {
		return this.data.stage.length > 0;
	}

	/** Is every bracket over (bracket is over when every match is over). */
	get everyBracketOver() {
		if (this.ctx.isFinalized) return true;

		return this.brackets.every((bracket) => bracket.everyMatchOver);
	}

	teamById(id: number) {
		let result: (typeof this.ctx.teams)[number] | null = null;
		let seed = 0;
		let currStartingBracketIdx = this.ctx.teams.at(0)?.startingBracketIdx;

		for (const team of this.ctx.teams) {
			if (team.startingBracketIdx !== currStartingBracketIdx) {
				currStartingBracketIdx = team.startingBracketIdx;
				seed = 1;
			} else {
				seed++;
			}

			if (team.id === id) {
				result = team;
				break;
			}
		}

		if (!result) return;

		return { ...result, seed };
	}

	participatedPlayersByTeamId(id: number) {
		const team = this.teamById(id);
		invariant(team, "Team not found");

		return team.members.filter((member) =>
			this.ctx.participatedUsers.includes(member.userId),
		);
	}

	/** Status of the given match, derived from the state of its bracket. */
	matchStatusById(matchId: number) {
		for (const bracket of this.brackets) {
			// preview brackets have locally generated match ids that can collide with real ones
			if (bracket.preview) continue;

			if (bracket.data.match.some((match) => match.id === matchId)) {
				return bracket.matchStatus(matchId);
			}
		}

		throw new Error("Match not found");
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
					(match) => match.roundId === round.id,
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

	/** Does this tournament have the option for teams to look for more members via the integrated LFG-solution. Also applies to solo subs view (after registration is closed) */
	get lfgEnabled() {
		return this.ctx.settings.enableSubs ?? true;
	}

	/** Can a new sub post be made at this time? */
	get canAddNewSubPost() {
		if (!this.lfgEnabled) return false;
		if (this.isInvitational) return false;
		if (this.ctx.isFinalized) return false;

		return (
			!this.ctx.settings.regClosesAt ||
			this.ctx.settings.regClosesAt ===
				dateToDatabaseTimestamp(this.ctx.startsAt) ||
			this.registrationOpen
		);
	}

	/** Can the organizer add a new sub post on behalf of a user at this time? Unlike users
	 * the organizer is not limited by the registration closing early. */
	get canAddNewSubPostAsOrganizer() {
		if (!this.lfgEnabled) return false;
		if (this.isInvitational) return false;

		return !this.everyBracketOver;
	}

	/** what is the max amount of members teams can add in total? This limit doesn't apply to the organizer adding members to a team. */
	get maxMembersPerTeam() {
		// special format
		if (this.minMembersPerTeam !== 4) return this.minMembersPerTeam;

		if (this.ctx.settings.maxMembersPerTeam) {
			return this.ctx.settings.maxMembersPerTeam;
		}

		return 6;
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
		return this.ctx.startsAt < new Date();
	}

	/** Has the regular check-in (check-in for the whole tournament) started? Note it is also considered started if it has ended. */
	get regularCheckInStartInThePast() {
		return this.regularCheckInStartsAt < new Date();
	}

	/** Date when the regular check-in is scheduled to start. */
	get regularCheckInStartsAt() {
		const result = new Date(this.ctx.startsAt);
		result.setMinutes(result.getMinutes() - 60);
		return result;
	}

	/** Date when the regular check-in is scheduled to start. */
	get regularCheckInEndsAt() {
		return this.ctx.startsAt;
	}

	/** Date when the tournament registration is scheduled to end. This can be set by the organizer. */
	get registrationClosesAt() {
		return this.ctx.settings.regClosesAt
			? databaseTimestampToDate(this.ctx.settings.regClosesAt)
			: this.ctx.startsAt;
	}

	/** Is the tournament registration open at this time? */
	get registrationOpen() {
		if (this.isInvitational) return false;

		return this.registrationClosesAt > new Date();
	}

	/** Can participants submit/undo their own weapon reports right now?
	 * Always open while the tournament is running; once finalized it stays open only for tournaments
	 * whose start time is inside the current-season-plus-adjacent-off-season window. */
	get weaponReportingOpen() {
		if (!this.ctx.isFinalized) return true;
		return tournamentInWeaponReportingWindow({
			tournamentStartTime: this.ctx.startsAt,
		});
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
							(group) => group.id === match.groupId,
						);
						const round = bracket.data.round.find(
							(round) => round.id === match.roundId,
						);

						roundName = `Groups ${group?.number ? groupNumberToLetters(group.number) : ""}${round?.number ?? ""}.${match.number}`;
					} else if (bracket.type === "swiss") {
						const group = bracket.data.group.find(
							(group) => group.id === match.groupId,
						);
						const round = bracket.data.round.find(
							(round) => round.id === match.roundId,
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

						const round = rounds.find((round) => round.id === match.roundId);

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
			bracketName: bracketName ?? "Main bracket",
			roundName,
			roundNameWithoutMatchIdentifier:
				roundNameWithoutMatchIdentifier(roundName),
		};
	}

	/** Returns a `Bracket` with the given index or the first bracket if not found. */
	bracketByIdxOrDefault(idx: number): Bracket {
		const bracket = this.bracketByIdx(idx);
		if (bracket) return bracket;

		const defaultBracket = this.bracketByIdx(0);
		invariant(defaultBracket, "No brackets found");

		logger.warn("Bracket not found, using fallback bracket");
		return defaultBracket;
	}

	/** Returns a `Bracket` with the given index or null if not found. */
	bracketByIdx(idx: number) {
		if (!this.ctx.settings.bracketProgression[idx]) return null;
		// a bracket that sources teams from itself (directly or via another bracket) can't be built
		if (this.bracketIdxsBeingBuilt.has(idx)) return null;

		return this.builtBracketByIdx(idx);
	}

	/** Returns the team that the user is the owner of, or null if not found. Includes invite code (only owner should see this, logic in the loader function). */
	ownedTeamByUser(
		user: OptionalIdObject,
	): ((typeof this.ctx.teams)[number] & { inviteCode: string }) | null {
		if (!user) return null;

		return this.ctx.teams.find((team) =>
			team.members.some(
				(member) => member.userId === user.id && member.role === "OWNER",
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
					match.opponent1 && match.opponent2 && !match.winnerSide;
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
								!match.winnerSide,
						)?.id !== match.id;

					if (otherTeamBusyWithPreviousMatch) {
						return { type: "WAITING_FOR_MATCH" } as const;
					}

					if (
						this.ctx.castedMatchesInfo?.lockedMatches.some(
							(lm) => lm.matchId === match.id,
						)
					) {
						return { type: "WAITING_FOR_CAST" } as const;
					}

					return {
						type: "MATCH",
						matchId: match.id,
						opponent: otherTeam.name,
						opponentId: otherTeam.id,
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
				setsGeneratedCount !== bracket.swissRoundCount;

			if (isParticipant && notAllRoundsGenerated) {
				return { type: "WAITING_FOR_ROUND" } as const;
			}
		}

		for (const bracket of this.brackets) {
			if (!bracket.preview) continue;

			const isParticipant = bracket.seeding?.includes(team.id);

			if (isParticipant) {
				return { type: "WAITING_FOR_BRACKET" } as const;
			}
		}

		if (team.checkIns.length === 0) return null;

		if (!team.droppedOut) {
			for (const bracket of this.brackets) {
				if (
					bracket.type !== "round_robin" ||
					bracket.preview ||
					bracket.everyMatchOver
				) {
					continue;
				}

				const isParticipant = bracket.participantTournamentTeamIds.includes(
					team.id,
				);
				const hasFollowUpBrackets = this.brackets.some((otherBracket) =>
					otherBracket.sources?.some(
						(source) => source.bracketIdx === bracket.idx,
					),
				);

				if (isParticipant && hasFollowUpBrackets) {
					return { type: "WAITING_FOR_GROUPS" } as const;
				}
			}
		}

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

		// in round robin all matches are independent from one another
		if (bracket.type === "round_robin") {
			return true;
		}

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
		match: MatchData;
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

		return bracket.data.match
			.filter(
				// only interested in matches of the same bracket & not the match  itself
				(match2) => match2.stageId === match.stageId && match2.id !== match.id,
			)
			.filter((match2) => {
				const hasSameParticipant =
					match2.opponent1?.id === match.opponent1?.id ||
					match2.opponent1?.id === match.opponent2?.id ||
					match2.opponent2?.id === match.opponent1?.id ||
					match2.opponent2?.id === match.opponent2?.id;

				const comesAfter =
					match2.groupId > match.groupId || match2.roundId > match.roundId;

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

	/**
	 * Checks if the given user can edit the tournament's calendar event info.
	 *
	 * Mirrors the authorization enforced when the edit is submitted: organization
	 * admins can only edit when the organization is established, unless they have
	 * the TOURNAMENT_ADDER role.
	 */
	canEditEventInfo(
		user: OptionalIdObject,
		{ isTournamentAdder }: { isTournamentAdder: boolean },
	) {
		if (!user) return false;
		if (isAdmin(user)) return true;
		if (this.ctx.author.id === user.id) return true;

		const isOrganizationAdmin = this.ctx.organization?.members.some(
			(member) => member.userId === user.id && member.role === "ADMIN",
		);

		return Boolean(
			isOrganizationAdmin &&
				(isTournamentAdder || this.ctx.organization?.isEstablished),
		);
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

	get streams() {
		const memberStreams = this.ctx.participantStreams.map((stream) => ({
			thumbnailUrl: stream.thumbnailUrl,
			twitchUserName: stream.twitch,
			viewerCount: stream.viewerCount,
			userId: stream.userId,
		}));

		const castStreams = this.ctx.castStreams.map((stream) => ({
			thumbnailUrl: stream.thumbnailUrl,
			twitchUserName: stream.twitch!,
			viewerCount: stream.viewerCount,
			userId: null as number | null,
		}));

		return [...memberStreams, ...castStreams].sort(
			(a, b) => b.viewerCount - a.viewerCount,
		);
	}

	/** Twitch account of every participant streaming the tournament right now, keyed by their user id. */
	get streamingParticipants(): Map<number, string> {
		if (!this.hasStarted || this.everyBracketOver) return new Map();

		return new Map(
			this.streams.flatMap((stream) =>
				stream.userId !== null
					? [[stream.userId, stream.twitchUserName] as const]
					: [],
			),
		);
	}

	get streamingParticipantIds(): number[] {
		return [...this.streamingParticipants.keys()];
	}
}
