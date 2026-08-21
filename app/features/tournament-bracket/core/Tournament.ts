import { sub } from "date-fns";
import type { Tables } from "~/db/tables";
import type { TournamentStageSettings } from "~/db/tables-json";
import { TOURNAMENT } from "~/features/tournament/tournament-constants";
import {
	modesIncluded,
	sortTeamsBySeeding,
	tournamentInWeaponReportingWindow,
	tournamentIsRanked,
} from "~/features/tournament/tournament-utils";
import type { MatchData } from "~/features/tournament-bracket/core/engine/types";
import * as Progression from "~/features/tournament-bracket/core/Progression";
import type { ModeShort } from "~/modules/in-game-lists/types";
import { hasPermission } from "~/modules/permissions/utils";
import {
	databaseTimestampToDate,
	dateToDatabaseTimestamp,
} from "~/utils/dates";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";
import { assertUnreachable } from "~/utils/types";
import { groupNumberToLetters } from "../tournament-bracket-utils";
import { type Bracket, createBracket } from "./Bracket";
import { calculateTeamStatus } from "./engine/swiss/team-status";
import { getRounds } from "./rounds";
import * as Seeding from "./Seeding";
import type { TournamentData } from "./Tournament.server";

export type OptionalIdObject = { id: number } | undefined;

/**
 * The state of one bracket that can only be derived from its match data. Shipped to the
 * views that render a tournament without loading any of its match data.
 */
export type BracketDerivedMeta = {
	/** Stage id of a started bracket, placeholder id of a bracket that has not been started. */
	id: number;
	createdAt: number | null;
	preview: boolean;
	everyMatchOver: boolean;
	participantTournamentTeamIds: number[];
	teamsPendingCheckIn: number[] | null;
	seeding: number[] | null;
};

/** A bracket's identity and state without its match data. See {@link Tournament.bracketsMeta}. */
export type BracketMeta = BracketDerivedMeta & {
	idx: number;
	name: string;
	type: Tables["TournamentStage"]["type"];
	sources: Progression.ParsedBracket["sources"];
	settings: TournamentStageSettings | null;
	requiresCheckIn: boolean;
	startTime: Date | null;
	isUnderground: boolean;
	isFinals: boolean;
	isStartingBracket: boolean;
	enoughTeams: boolean;
};

/** One bracket as a route loader ships it, ready to be revived by {@link Tournament.withBrackets}. */
export type SerializedBracket = {
	id: number;
	idx: number;
	preview: boolean;
	data: TournamentData["data"];
	type: Tables["TournamentStage"]["type"];
	participantsReady?: boolean;
	name: string;
	teamsPendingCheckIn?: number[];
	createdAt: number | null;
	sources?: { bracketIdx: number; placements: number[] }[];
	seeding?: number[];
	settings: TournamentStageSettings | null;
	requiresCheckIn: boolean;
	startTime: number | null;
};

/** One live stream of the tournament: a participant's stream or an official cast stream. */
export type TournamentStream = {
	thumbnailUrl: string;
	twitchUserName: string;
	viewerCount: number;
	userId: number | null;
	teamName: string | null;
	user: {
		id: number;
		username: string;
		discordId: string;
		discordAvatar: string | null;
		customUrl: string | null;
		customAvatarUrl: string | null;
	} | null;
};

type TournamentArgs = {
	/** Match data of every bracket. Absent in the views that only got {@link bracketsMeta}. */
	data?: TournamentData["data"];
	ctx: TournamentData["ctx"];
	/** Derived bracket state, when the match data it was derived from is not shipped. */
	bracketsMeta?: BracketDerivedMeta[];
	/** Brackets whose match data this view loaded on its own. */
	brackets?: SerializedBracket[];
	/** User ids of everyone who played at least one map. */
	participatedUsers?: number[];
	/** Live streams of the tournament. Absent in the views whose loader does not ship them. */
	streams?: TournamentStream[];
};

/** The progress status of a team member in a running tournament, as resolved by {@link Tournament.teamMemberOfProgressStatus}. */
export type TournamentTeamMemberProgressStatus = NonNullable<
	ReturnType<Tournament["teamMemberOfProgressStatus"]>
>;

/** Extends and providers utility functions on top of the bracket-manager library. Updating data after the bracket has started is responsibility of bracket-manager. */
export class Tournament {
	ctx;
	/** See {@link TournamentArgs.participatedUsers}, null when this view did not get them. */
	readonly participatedUserIds: number[] | null;
	private args;
	private data;
	private _brackets: Array<Bracket | undefined> = [];
	private _allBrackets: Bracket[] | undefined;
	private _derivedMeta: BracketDerivedMeta[] | undefined;
	private _bracketsMeta: BracketMeta[] | undefined;
	private bracketIdxsBeingBuilt = new Set<number>();

	constructor(args: TournamentArgs) {
		const { data, ctx, bracketsMeta, brackets } = args;

		const hasStarted = data
			? data.stage.length > 0
			: Boolean(bracketsMeta?.some((meta) => !meta.preview));
		const minMembersPerTeam = ctx.settings.minMembersPerTeam ?? 4;

		const teamsInSeedOrder = sortTeamsBySeeding(ctx.teams, minMembersPerTeam);

		this.args = args;
		this.data = data;
		this.participatedUserIds = args.participatedUsers ?? null;
		this._derivedMeta = bracketsMeta;
		this.ctx = {
			...ctx,
			teams: hasStarted
				? // after the start the teams who did not check-in are irrelevant
					teamsInSeedOrder.filter((team) => team.checkIns.length > 0)
				: teamsInSeedOrder,
			startsAt: databaseTimestampToDate(ctx.startsAt),
		};

		for (const bracket of brackets ?? []) {
			this._brackets[bracket.idx] = createBracket({
				...bracket,
				tournament: this,
				startTime: bracket.startTime
					? databaseTimestampToDate(bracket.startTime)
					: null,
			});
		}
	}

	/**
	 * The same tournament with the match data of the given brackets available. Used by the views
	 * that load one bracket's data of their own, the layout only shipping {@link bracketsMeta}.
	 */
	withBrackets(
		brackets: SerializedBracket[],
		extras?: {
			participatedUsers?: number[] | null;
			streams?: TournamentStream[];
		},
	) {
		return new Tournament({
			...this.args,
			brackets,
			participatedUsers:
				extras?.participatedUsers ?? this.args.participatedUsers,
			streams: extras?.streams ?? this.args.streams,
		});
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

	/**
	 * State of every bracket without its match data. Available in every view, unlike
	 * {@link brackets} which needs the match data the bracket views load.
	 */
	get bracketsMeta(): BracketMeta[] {
		if (this._bracketsMeta) return this._bracketsMeta;

		const progression = this.ctx.settings.bracketProgression;
		const derived = this.bracketsDerivedMeta;

		this._bracketsMeta = progression.map((bracket, idx) => ({
			...derived[idx],
			idx,
			name: bracket.name,
			type: bracket.type,
			sources: bracket.sources,
			settings: bracket.settings ?? null,
			requiresCheckIn: bracket.requiresCheckIn ?? false,
			startTime: bracket.startTime
				? databaseTimestampToDate(bracket.startTime)
				: null,
			isUnderground: Progression.isUnderground(idx, progression),
			isFinals: Progression.isFinals(idx, progression),
			isStartingBracket: !bracket.sources || bracket.sources.length === 0,
			enoughTeams:
				derived[idx].participantTournamentTeamIds.length >=
				TOURNAMENT.ENOUGH_TEAMS_TO_START,
		}));

		return this._bracketsMeta;
	}

	/**
	 * {@link bracketsMeta} of the brackets the user can switch between. Brackets that never
	 * started are not shown once the tournament has been finalized.
	 */
	get visibleBracketsMeta(): BracketMeta[] {
		return this.bracketsMeta.filter(
			(bracket) => !this.ctx.isFinalized || !bracket.preview,
		);
	}

	/**
	 * Divisions of a league. Every starting bracket is a division of its own, identified by its
	 * bracket idx, the brackets it feeds into (its playoffs) belonging to that division as well.
	 */
	get leagueDivisions(): BracketMeta[] {
		if (!this.isLeague) return [];

		return this.bracketsMeta.filter((bracket) => bracket.isStartingBracket);
	}

	/** Division the given bracket belongs to, or null if the tournament has no divisions. */
	leagueDivisionOfBracket(bracketIdx: number): number | null {
		const division = this.leagueDivisions.find((division) =>
			this.bracketIdxsOfDivision(division.idx).includes(bracketIdx),
		);

		return division?.idx ?? null;
	}

	/** {@link bracketsMeta} limited to the brackets of one division, if a division is given. */
	bracketsMetaOfDivision(divisionIdx: number | null): BracketMeta[] {
		if (divisionIdx === null) return this.bracketsMeta;

		const bracketIdxs = this.bracketIdxsOfDivision(divisionIdx);

		return this.bracketsMeta.filter((bracket) =>
			bracketIdxs.includes(bracket.idx),
		);
	}

	/** {@link visibleBracketsMeta} limited to the brackets of one division, if a division is given. */
	visibleBracketsMetaOfDivision(divisionIdx: number | null): BracketMeta[] {
		const visibleIdxs = new Set(
			this.visibleBracketsMeta.map((bracket) => bracket.idx),
		);

		return this.bracketsMetaOfDivision(divisionIdx).filter((bracket) =>
			visibleIdxs.has(bracket.idx),
		);
	}

	private bracketIdxsOfDivision(divisionIdx: number) {
		return Progression.bracketsReachableFrom(
			divisionIdx,
			this.ctx.settings.bracketProgression,
		);
	}

	/** Teams that can play in the bracket: its participants plus the ones still pending check-in. */
	eligibleTeamsCountOfBracket(bracketIdx: number) {
		const bracket = this.bracketsMeta[bracketIdx];

		if (bracket.sources) {
			return (
				(bracket.teamsPendingCheckIn ?? []).length +
				bracket.participantTournamentTeamIds.length
			);
		}

		if (!this.isMultiStartingBracket) {
			return this.ctx.teams.length;
		}

		return this.ctx.teams.filter(
			(team) => (team.startingBracketIdx ?? 0) === bracketIdx,
		).length;
	}

	/** Teams of the bracket: its participants, or every eligible team while it is a preview. */
	teamsCountOfBracket(bracketIdx: number) {
		const bracket = this.bracketsMeta[bracketIdx];

		return bracket.preview
			? this.eligibleTeamsCountOfBracket(bracketIdx)
			: bracket.participantTournamentTeamIds.length;
	}

	/** {@link bracketsMeta} in the shape it is shipped in, i.e. only what match data is needed for. */
	get bracketsDerivedMeta(): BracketDerivedMeta[] {
		if (!this._derivedMeta) {
			this._derivedMeta = this.brackets.map((bracket) => ({
				id: bracket.id,
				createdAt: bracket.createdAt ?? null,
				preview: bracket.preview,
				everyMatchOver: bracket.everyMatchOver,
				participantTournamentTeamIds: bracket.participantTournamentTeamIds,
				teamsPendingCheckIn: bracket.teamsPendingCheckIn ?? null,
				seeding: bracket.seeding ?? null,
			}));
		}

		return this._derivedMeta;
	}

	/** State of one bracket without its match data, or null if there is no such bracket. */
	bracketMetaByIdx(idx: number): BracketMeta | null {
		return this.bracketsMeta[idx] ?? null;
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
		invariant(
			this.data,
			`Bracket ${bracketIdx} has no match data loaded, use bracketsMeta or load the bracket in this view's loader`,
		);
		const data = this.data;

		const {
			type,
			name,
			sources,
			requiresCheckIn = false,
			startTime = null,
			settings,
		} = this.ctx.settings.bracketProgression[bracketIdx];

		const inProgressStage = data.stage.find((stage) => stage.name === name);

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
					...data,
					group: data.group.filter(
						(group) => group.stageId === inProgressStage.id,
					),
					match: data.match.filter(
						(match) => match.stageId === inProgressStage.id,
					),
					stage: data.stage.filter((stage) => stage.id === inProgressStage.id),
					round: data.round.filter(
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
			participantsReady:
				checkedInTeamsWithReplaysAvoided.length >=
					TOURNAMENT.ENOUGH_TEAMS_TO_START &&
				(!sources || relevantMatchesFinished),
			teamsPendingCheckIn: bracketIdx !== 0 ? notCheckedInTeams : undefined,
		});
	}

	private resolveTeamsFromSources(
		unsortedSources: NonNullable<Progression.ParsedBracket["sources"]>,
		bracketIdx: number,
	) {
		const sources = Progression.sortedSourcesForSeeding(
			unsortedSources,
			this.ctx.settings.bracketProgression,
		);

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
		for (const source of Progression.sortedSourcesForSeeding(
			bracket.sources,
			this.ctx.settings.bracketProgression,
		)) {
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
		return this.bracketsMeta.some((bracket) => !bracket.preview);
	}

	/** Is every bracket over (bracket is over when every match is over). */
	get everyBracketOver() {
		if (this.ctx.isFinalized) return true;

		return this.bracketsMeta.every((bracket) => bracket.everyMatchOver);
	}

	teamById(id: number) {
		let result: (typeof this.ctx.teams)[number] | null = null;
		let seed = 0;
		let currStartingBracketIdx = this.ctx.teams.at(0)?.startingBracketIdx ?? 0;

		for (const team of this.ctx.teams) {
			const teamStartingBracketIdx = team.startingBracketIdx ?? 0;
			if (teamStartingBracketIdx !== currStartingBracketIdx) {
				currStartingBracketIdx = teamStartingBracketIdx;
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

	/** User ids of the given team's members who played at least one map of the tournament. */
	participatedPlayerUserIdsByTeamId(id: number) {
		const team = this.teamById(id);
		invariant(team, "Team not found");
		const participatedUserIds = this.participatedUserIds;
		invariant(participatedUserIds, "Participated user ids not loaded");

		return team.memberUserIds.filter((userId) =>
			participatedUserIds.includes(userId),
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
		const idx = this.brackets.findIndex(
			(bracket) =>
				// preview brackets have locally generated match ids that can collide with real ones
				!bracket.preview &&
				bracket.data.match.some((match) => match.id === matchId),
		);

		if (idx === -1) return null;

		return idx;
	}

	/** Should it be possible for the given user to finalize this tournament at this time? */
	canFinalize(user: OptionalIdObject) {
		// can skip underground bracket
		const relevantBrackets = this.bracketsMeta.filter(
			(b) => !b.preview || !b.isUnderground,
		);

		return (
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

		if (team.memberUserIds.length < this.minMembersPerTeam) {
			return {
				isFulfilled: false,
				reason: `Team needs at least ${this.minMembersPerTeam} members`,
			};
		}

		if (this.teamsPrePickMaps && !team.hasMapPool) {
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
		// elapsed time math instead of wall clock math so that the window
		// stays one hour long across a DST transition
		return new Date(this.ctx.startsAt.getTime() - 60 * 60 * 1000);
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
	 * Is this tournament a league? A league is played over many weeks, each starting bracket
	 * being a division that teams are placed in by the organizer.
	 * */
	get isLeague() {
		return this.ctx.settings.isLeague === true;
	}

	/** Does this tournament have many brackets that act as the first bracket? In this format many bracket progressions advance independently from each other (so not all teams can meet). */
	get isMultiStartingBracket() {
		let count = 0;
		for (const bracket of this.ctx.settings.bracketProgression) {
			if (!bracket.sources) count++;
		}

		return count > 1;
	}

	/** Can the given user's team check in to the bracket at this time? */
	canCheckInToBracket(bracketIdx: number, user: OptionalIdObject) {
		const bracket = this.bracketMetaByIdx(bracketIdx);
		// using regular check-in
		if (!bracket?.teamsPendingCheckIn) return false;

		if (bracket.startTime) {
			const checkInOpen =
				sub(bracket.startTime.getTime(), { hours: 1 }).getTime() < Date.now() &&
				bracket.startTime.getTime() > Date.now();

			if (!checkInOpen) return false;
		}

		const team = this.teamMemberOfByUser(user);
		if (!team) return false;

		return bracket.teamsPendingCheckIn.includes(team.id);
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

	/** Returns a `Bracket` with the given index or null if not found. */
	bracketByIdx(idx: number) {
		if (!this.ctx.settings.bracketProgression[idx]) return null;
		// a bracket that sources teams from itself (directly or via another bracket) can't be built
		if (this.bracketIdxsBeingBuilt.has(idx)) return null;

		return this.builtBracketByIdx(idx);
	}

	/** Returns the team that the user is the owner of, or null if not found. */
	ownedTeamByUser(user: OptionalIdObject) {
		if (!user) return null;

		return this.ctx.teams.find((team) => team.ownerUserId === user.id) ?? null;
	}

	/**
	 * Returns the team that the user is a member of, or null if not found.
	 * Note that user can be a member of multiple teams, this returns the team that the user joined most recently.
	 */
	teamMemberOfByUser(user: OptionalIdObject) {
		if (!user) return null;

		const teams = this.ctx.teams.filter((team) =>
			team.memberUserIds.includes(user.id),
		);
		if (teams.length <= 1) return teams[0] ?? null;

		const latestTeamId = this.ctx.latestTeamIdByDuplicatedUserId[user.id];
		return teams.find((team) => team.id === latestTeamId) ?? teams[0];
	}

	/**
	 * Returns the progress status of the user in the tournament, or null if not participating.
	 * e.g. might return "WAITING_FOR_MATCH" if the user is waiting for their next match or "WAITING_FOR_CAST" if the match is ready to be played but locked waiting for the cast.
	 */
	/**
	 * The started brackets, built without generating the previews of the others.
	 * Generating a preview bracket is expensive, so prefer this over filtering
	 * {@link brackets} when only the started ones are needed.
	 */
	private get startedBrackets(): Bracket[] {
		const data = this.data;
		if (!data) return this.brackets.filter((bracket) => !bracket.preview);

		return this.ctx.settings.bracketProgression.flatMap(
			(progressionBracket, idx) =>
				data.stage.some((stage) => stage.name === progressionBracket.name)
					? [this.builtBracketByIdx(idx)]
					: [],
		);
	}

	teamMemberOfProgressStatus(user: OptionalIdObject) {
		const team = this.teamMemberOfByUser(user);
		if (!team) return null;

		const startedBrackets = this.startedBrackets;

		if (startedBrackets.length === 0 && !this.regularCheckInIsOpen) {
			return null;
		}

		for (const bracket of startedBrackets) {
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

		for (const bracket of startedBrackets) {
			if (bracket.type !== "swiss") continue;
			// dropped out teams and teams whose run ended early via the advance
			// threshold are excluded from the pairing, so no round is coming for them
			if (bracket.everyMatchOver || team.droppedOut) continue;

			// TODO: both seeding and participantTournamentTeamIds are used for the same thing
			const isParticipant = bracket.participantTournamentTeamIds.includes(
				team.id,
			);

			const teamsMatches = bracket.data.match.filter(
				(match) =>
					match.opponent1?.id === team.id || match.opponent2?.id === team.id,
			);
			const notAllRoundsGenerated =
				teamsMatches.length !== bracket.swissRoundCount;

			const advanceThreshold = bracket.settings?.advanceThreshold;
			const runEndedEarly = advanceThreshold
				? calculateTeamStatus({
						...swissTeamRecord(teamsMatches, team.id),
						advanceThreshold,
						roundCount: bracket.swissRoundCount,
					}) !== "active"
				: false;

			if (isParticipant && notAllRoundsGenerated && !runEndedEarly) {
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
			for (const bracket of startedBrackets) {
				if (bracket.type !== "round_robin" || bracket.everyMatchOver) {
					continue;
				}

				const isParticipant = bracket.participantTournamentTeamIds.includes(
					team.id,
				);
				const hasFollowUpBrackets = this.ctx.settings.bracketProgression.some(
					(progressionBracket) =>
						progressionBracket.sources?.some(
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
		return hasPermission(this.ctx, "ADMIN", user);
	}

	/** Checks if the given user can edit the tournament's calendar event info. */
	canEditEventInfo(user: OptionalIdObject) {
		return hasPermission(this.ctx, "EDIT_EVENT_INFO", user);
	}

	/** Checks if the given user can set the in-game names of the tournament's players. */
	canEditTournamentNames(user: OptionalIdObject) {
		return hasPermission(this.ctx, "EDIT_IN_GAME_NAMES", user);
	}

	/** Checks if the given user is an organizer of the tournament. */
	isOrganizer(user: OptionalIdObject) {
		return hasPermission(this.ctx, "ORGANIZE", user);
	}

	/** Checks if the given user is an organizer or streamer of the tournament. */
	isOrganizerOrStreamer(user: OptionalIdObject) {
		return hasPermission(this.ctx, "MANAGE_MATCHES", user);
	}

	/** Live streams of the tournament, empty in the views whose loader did not ship them. */
	get streams(): TournamentStream[] {
		return this.args.streams ?? [];
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

/** A team's swiss set record off its match data, a BYE counting as a win. */
function swissTeamRecord(matches: MatchData[], teamId: number) {
	let wins = 0;
	let losses = 0;

	for (const match of matches) {
		const side =
			match.opponent1?.id === teamId
				? "opponent1"
				: match.opponent2?.id === teamId
					? "opponent2"
					: null;
		if (!side) continue;

		if (!match.opponent1 || !match.opponent2) {
			wins++;
			continue;
		}
		if (!match.winnerSide) continue;

		if (match.winnerSide === side) {
			wins++;
		} else {
			losses++;
		}
	}

	return { wins, losses };
}
