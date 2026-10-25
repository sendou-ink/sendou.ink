import { addDays, addHours, subMinutes } from "date-fns";
import * as showcaseNames from "~/db/seed/core/showcaseNames";
import { showcaseOptions } from "~/db/seed/dev/users";
import * as BuildFactory from "~/db/seed/factories/BuildFactory";
import * as PlusSuggestionFactory from "~/db/seed/factories/PlusSuggestionFactory";
import * as ScrimPostFactory from "~/db/seed/factories/ScrimPostFactory";
import * as SQGroupFactory from "~/db/seed/factories/SQGroupFactory";
import * as SQMatchFactory from "~/db/seed/factories/SQMatchFactory";
import * as TeamFactory from "~/db/seed/factories/TeamFactory";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentLFGTeamFactory from "~/db/seed/factories/TournamentLFGTeamFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import type { TournamentSettings } from "~/db/tables-json";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import { runWithoutWebPush } from "~/features/notifications/core/push-suppression.server";
import { FULL_GROUP_SIZE } from "~/features/sendouq/q-constants";
import * as SQMatchRepository from "~/features/sendouq-match/SQMatchRepository.server";
import { tournamentFromDB } from "~/features/tournament-bracket/core/Tournament.server";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { invariant } from "~/utils/invariant";
import { toDBBoolean } from "~/utils/sql";
import {
	PLUS_VOTING_PAGE,
	SENDOUQ_LOOKING_PAGE,
	scrimPage,
	scrimsPage,
	sendouQMatchPage,
	teamPage,
	tournamentMatchPage,
	tournamentPage,
	tournamentRegisterPage,
	tournamentSubsPage,
	userPage,
} from "~/utils/urls";

const MAX_RECENT_RUNS = 10;

const SCENARIO_CATEGORIES = [
	"SendouQ",
	"Tournaments",
	"Tournament LFG",
	"Scrims",
	"Users & teams",
	"Plus server",
] as const;

type ScenarioCategory = (typeof SCENARIO_CATEGORIES)[number];

interface NumberParam {
	kind: "number";
	label: string;
	min: number;
	max: number;
	default: number;
}

interface SelectParam<Value extends string = string> {
	kind: "select";
	label: string;
	options: ReadonlyArray<{ value: Value; label: string }>;
	default: Value;
}

type ParamSpec = NumberParam | SelectParam;

type ParamValues<Params extends Record<string, ParamSpec>> = {
	[Key in keyof Params]: Params[Key] extends SelectParam<infer Value>
		? Value
		: number;
};

interface ScenarioResult {
	/** Who to log in as to see the scenario. */
	userId: number;
	/** Where the scenario is seen. */
	path: string;
}

interface Scenario<
	Params extends Record<string, ParamSpec> = Record<string, ParamSpec>,
> {
	id: string;
	title: string;
	description: string;
	category: ScenarioCategory;
	params: Params;
	// method syntax keeps scenarios with typed params assignable to the erased type
	run(params: ParamValues<Params>): Promise<ScenarioResult>;
}

const BRACKET_FORMATS = {
	single_elimination: [
		{
			name: "Main bracket",
			type: "single_elimination",
			requiresCheckIn: false,
			settings: { skippedRounds: ["THIRD_PLACE_MATCH"] },
		},
	],
	double_elimination: [
		{
			name: "Main bracket",
			type: "double_elimination",
			requiresCheckIn: false,
			settings: {},
		},
	],
	round_robin: [
		{
			name: "Groups stage",
			type: "round_robin",
			requiresCheckIn: false,
			settings: { teamsPerGroup: 4 },
		},
	],
	swiss: [
		{
			name: "Swiss",
			type: "swiss",
			requiresCheckIn: false,
			settings: { groupCount: 1, roundCount: 4 },
		},
	],
} satisfies Record<string, TournamentSettings["bracketProgression"]>;

const formatParam = selectParam(
	"Format",
	[
		{ value: "single_elimination", label: "Single elim" },
		{ value: "double_elimination", label: "Double elim" },
		{ value: "round_robin", label: "Round robin" },
		{ value: "swiss", label: "Swiss" },
	],
	"single_elimination",
);

const teamsParam = numberParam("Teams", { min: 4, max: 64, default: 8 });

/** Mostly solo players, now and then a team short of players. */
const LOOKING_GROUP_SIZES = [1, 1, 2, 1, 3];

const SCENARIOS: Scenario[] = [
	defineScenario({
		id: "sendouq-looking",
		title: "Looking for a match",
		description:
			"Your group is queueing on the looking page among other groups, some of which liked you.",
		category: "SendouQ",
		params: {
			groupSize: selectParam(
				"Your group",
				[
					{ value: "1", label: "Solo" },
					{ value: "2", label: "Duo" },
					{ value: "3", label: "Trio" },
					{ value: "4", label: "Full" },
				],
				"4",
			),
			otherGroups: numberParam("Other groups", { min: 0, max: 20, default: 6 }),
			likedYou: numberParam("Liked you", { min: 0, max: 20, default: 2 }),
		},
		run: async ({ groupSize, otherGroups, likedYou }) => {
			const ownSize = Number(groupSize);
			// a full group is matched against full ones, a smaller one merges with groups it fits with
			const otherSize =
				ownSize === FULL_GROUP_SIZE
					? FULL_GROUP_SIZE
					: FULL_GROUP_SIZE - ownSize;

			const otherGroupIds: number[] = [];
			for (let i = 0; i < otherGroups; i++) {
				const group = await SQGroupFactory.create({
					memberUserIds: await freshUserIds(otherSize),
				});
				otherGroupIds.push(group.id);
			}

			const memberUserIds = await freshUserIds(ownSize);
			await SQGroupFactory.create(
				{ memberUserIds },
				{ likedByGroupIds: otherGroupIds.slice(0, likedYou) },
			);

			return { userId: memberUserIds[0], path: SENDOUQ_LOOKING_PAGE };
		},
	}),
	defineScenario({
		id: "sendouq-match",
		title: "SendouQ match",
		description:
			"A match between two full groups. You own the group the match is waiting on.",
		category: "SendouQ",
		params: {
			state: selectParam(
				"State",
				[
					{ value: "started", label: "Just started" },
					{ value: "opponent-reported", label: "Opponent reported" },
					{ value: "cancel-requested", label: "Cancel requested" },
					{ value: "concluded", label: "Concluded" },
				],
				"started",
			),
		},
		run: async ({ state }) => {
			const alphaUserIds = await freshUserIds(FULL_GROUP_SIZE);
			const bravoUserIds = await freshUserIds(FULL_GROUP_SIZE);
			const match = await SQMatchFactory.create(
				{ alphaUserIds, bravoUserIds, isMatchmade: true },
				{
					isReported: state === "opponent-reported",
					isConcluded: state === "concluded",
				},
			);

			if (state === "cancel-requested") {
				await SQMatchRepository.requestCancelMatch({
					matchId: match.id,
					requestedByUserId: alphaUserIds[0],
					reason: "Our player disconnected and can't come back",
					nominatedUserIds: [],
				});
			}

			const isAlphaWaitedOn = state === "started" || state === "concluded";

			return {
				userId: isAlphaWaitedOn ? alphaUserIds[0] : bravoUserIds[0],
				path: sendouQMatchPage(match.id),
			};
		},
	}),
	defineScenario({
		id: "tournament-organizer",
		title: "Organizing a tournament",
		description:
			"Teams registered in the format of your choice. You are the organizer.",
		category: "Tournaments",
		params: {
			teams: teamsParam,
			format: formatParam,
			progress: selectParam(
				"Progress",
				[
					{ value: "registration", label: "Registration" },
					{ value: "started", label: "Bracket started" },
					{ value: "first-round-played", label: "1st round played" },
					{ value: "finished", label: "Finalized" },
				],
				"first-round-played",
			),
		},
		run: async ({ teams, format, progress }) => {
			const [organizerId] = await freshUserIds(1);
			const isStarted = progress !== "registration";

			const tournament = await TournamentFactory.create({
				authorId: organizerId,
				bracketProgression: BRACKET_FORMATS[format],
				startTimes: [
					dateToDatabaseTimestamp(
						isStarted ? subMinutes(new Date(), 30) : addHours(new Date(), 2),
					),
				],
			});
			await registerTeams(tournament.id, teams, { isCheckedIn: isStarted });

			if (progress === "finished") {
				await TournamentFactory.playOut(tournament.id, "all");
			} else if (isStarted) {
				await TournamentFactory.startBracket(tournament.id);
			}
			if (progress === "first-round-played") {
				await TournamentFactory.playMatches(tournament.id, {
					roundNumbers: [1],
				});
			}

			return { userId: organizerId, path: tournamentPage(tournament.id) };
		},
	}),
	defineScenario({
		id: "tournament-player",
		title: "Playing a tournament match",
		description:
			"The bracket just started. You captain a team with its first match waiting to be played.",
		category: "Tournaments",
		params: { teams: teamsParam, format: formatParam },
		run: async ({ teams, format }) => {
			const [organizerId] = await freshUserIds(1);
			const tournament = await TournamentFactory.create({
				authorId: organizerId,
				bracketProgression: BRACKET_FORMATS[format],
				startTimes: [dateToDatabaseTimestamp(subMinutes(new Date(), 30))],
			});
			const registeredTeams = await registerTeams(tournament.id, teams, {
				isCheckedIn: true,
			});
			await TournamentFactory.startBracket(tournament.id);

			const match = await firstPlayableMatch(tournament.id);
			const team = registeredTeams.find(
				(registeredTeam) => registeredTeam.id === match.teamId,
			);
			invariant(team, "Match team is not one of the registered teams");

			return {
				userId: team.ownerUserId,
				path: tournamentMatchPage({
					tournamentId: tournament.id,
					matchId: match.matchId,
				}),
			};
		},
	}),
	defineScenario({
		id: "tournament-registration",
		title: "Registration open",
		description:
			"A tournament starting in 2 hours. You have not registered yet.",
		category: "Tournaments",
		params: {
			registeredTeams: numberParam("Teams signed up", {
				min: 0,
				max: 64,
				default: 5,
			}),
		},
		run: async ({ registeredTeams }) => {
			const [organizerId, userId] = await freshUserIds(2);
			const tournament = await TournamentFactory.create({
				authorId: organizerId,
				startTimes: [dateToDatabaseTimestamp(addHours(new Date(), 2))],
			});
			await registerTeams(tournament.id, registeredTeams, {
				isCheckedIn: false,
			});

			return { userId, path: tournamentRegisterPage(tournament.id) };
		},
	}),
	defineScenario({
		id: "tournament-lfg-solo",
		title: "Looking for a team",
		description:
			"Registration is open and you are in the LFG queue alone, among solo players and teams short of players.",
		category: "Tournament LFG",
		params: {
			othersLooking: numberParam("Others looking", {
				min: 0,
				max: 30,
				default: 10,
			}),
			likedYou: numberParam("Liked you", { min: 0, max: 30, default: 2 }),
			youLiked: numberParam("You liked", { min: 0, max: 30, default: 1 }),
		},
		run: async ({ othersLooking, likedYou, youLiked }) => {
			const tournamentId = await lfgTournamentId();
			const likedByYouCount = Math.min(youLiked, othersLooking);

			const likedByYouIds = await lookingGroupIds(tournamentId, {
				count: likedByYouCount,
			});
			const [userId] = await freshShowcaseUserIds(1);
			const ownGroup = await TournamentLFGTeamFactory.create(
				{ tournamentId, userId, lfgNote: showcaseNames.postText() },
				{ likedTeamIds: likedByYouIds },
			);
			await lookingGroupIds(tournamentId, {
				count: othersLooking - likedByYouCount,
				likingCount: likedYou,
				likedTeamId: ownGroup.id,
			});

			return { userId, path: tournamentSubsPage(tournamentId) };
		},
	}),
	defineScenario({
		id: "tournament-lfg-team",
		title: "Team short of players",
		description:
			"Registration is open and your registered team is in the LFG queue looking for more players, some of whom liked it.",
		category: "Tournament LFG",
		params: {
			teamSize: selectParam(
				"Your team",
				[
					{ value: "2", label: "2 players" },
					{ value: "3", label: "3 players" },
				],
				"3",
			),
			you: selectParam(
				"You are",
				[
					{ value: "owner", label: "Its owner" },
					{ value: "member", label: "A member" },
				],
				"owner",
			),
			othersLooking: numberParam("Others looking", {
				min: 0,
				max: 30,
				default: 8,
			}),
			likedYou: numberParam("Liked you", { min: 0, max: 30, default: 2 }),
		},
		run: async ({ teamSize, you, othersLooking, likedYou }) => {
			const tournamentId = await lfgTournamentId();
			const memberUserIds = await freshShowcaseUserIds(Number(teamSize));
			const ownTeam = await TournamentTeamFactory.create(
				{ tournamentId, memberUserIds },
				{ isLooking: true },
			);
			await lookingGroupIds(tournamentId, {
				count: othersLooking,
				likingCount: likedYou,
				likedTeamId: ownTeam.id,
			});

			return {
				userId: you === "owner" ? memberUserIds[0] : memberUserIds[1],
				path: tournamentSubsPage(tournamentId),
			};
		},
	}),
	defineScenario({
		id: "tournament-lfg-subs",
		title: "Subs list",
		description:
			"Registration has closed and the tournament is about to start, players left their names as subs.",
		category: "Tournament LFG",
		params: {
			subs: numberParam("Subs", { min: 0, max: 30, default: 8 }),
			you: selectParam(
				"You are",
				[
					{ value: "captain", label: "A team's captain" },
					{ value: "sub", label: "A sub" },
					{ value: "player", label: "A player without a team" },
				],
				"captain",
			),
		},
		run: async ({ subs, you }) => {
			const [organizerId] = await freshUserIds(1);
			const tournament = await TournamentFactory.create({
				authorId: organizerId,
				startTimes: [dateToDatabaseTimestamp(subMinutes(new Date(), 10))],
			});
			const [team] = await registerTeams(tournament.id, 8, {
				isCheckedIn: true,
			});

			const subUserIds = await freshShowcaseUserIds(subs);
			for (const [i, userId] of subUserIds.entries()) {
				await TournamentLFGTeamFactory.create({
					tournamentId: tournament.id,
					userId,
					isStayAsSub: true,
					lfgNote: i % 3 === 0 ? undefined : showcaseNames.postText(),
				});
			}

			const [playerId] = await freshShowcaseUserIds(1);
			if (you === "sub") {
				await TournamentLFGTeamFactory.create({
					tournamentId: tournament.id,
					userId: playerId,
					isStayAsSub: true,
					lfgNote: showcaseNames.postText(),
				});
			}

			return {
				userId: you === "captain" ? team.ownerUserId : playerId,
				path: tournamentSubsPage(tournament.id),
			};
		},
	}),
	defineScenario({
		id: "scrim",
		title: "Scrim",
		description:
			"Your scrim post for later today and a request another group made to it.",
		category: "Scrims",
		params: {
			state: selectParam(
				"State",
				[
					{ value: "request-pending", label: "Request pending" },
					{ value: "scheduled", label: "Scheduled" },
				],
				"request-pending",
			),
		},
		run: async ({ state }) => {
			const ownerUserIds = await freshUserIds(FULL_GROUP_SIZE);
			const requesterUserIds = await freshUserIds(FULL_GROUP_SIZE);

			const post = await ScrimPostFactory.create(
				{
					users: scrimUsers(ownerUserIds),
					startsAt: dateToDatabaseTimestamp(addHours(new Date(), 3)),
					isScheduledForFuture: true,
				},
				{
					requests: [
						{
							users: scrimUsers(requesterUserIds),
							isAccepted: state === "scheduled",
						},
					],
				},
			);

			return {
				userId: ownerUserIds[0],
				path: state === "scheduled" ? scrimPage(post.id) : scrimsPage(),
			};
		},
	}),
	defineScenario({
		id: "new-user",
		title: "Brand new user",
		description:
			"Logged in for the first time: no profile, friend code, team or history.",
		category: "Users & teams",
		params: {},
		run: async () => {
			const user = await UserFactory.create({
				discordId: freshDiscordId(),
				profile: null,
				friendCode: null,
			});

			return { userId: user.id, path: userPage(user) };
		},
	}),
	defineScenario({
		id: "veteran-user",
		title: "Long-time user",
		description:
			"A profile full of history, for checking long lists and pagination.",
		category: "Users & teams",
		params: {
			builds: numberParam("Builds", { min: 0, max: 100, default: 30 }),
			tournaments: numberParam("Tournaments played", {
				min: 0,
				max: 10,
				default: 3,
			}),
		},
		run: async ({ builds, tournaments }) => {
			const user = await UserFactory.create({ discordId: freshDiscordId() });

			await BuildFactory.createMany(builds, { ownerId: user.id });

			for (let i = 0; i < tournaments; i++) {
				const [organizerId] = await freshUserIds(1);
				const teamRosters = [
					[user.id, ...(await freshUserIds(FULL_GROUP_SIZE - 1))],
					await freshUserIds(FULL_GROUP_SIZE),
					await freshUserIds(FULL_GROUP_SIZE),
					await freshUserIds(FULL_GROUP_SIZE),
				];
				await TournamentFactory.createPlayed(
					{
						authorId: organizerId,
						startTimes: [
							dateToDatabaseTimestamp(addDays(new Date(), -7 * (i + 1))),
						],
					},
					{ teamRosters, playedOut: "all" },
				);
			}

			return { userId: user.id, path: userPage(user) };
		},
	}),
	defineScenario({
		id: "team-owner",
		title: "Team owner",
		description: "You own a team with members to manage.",
		category: "Users & teams",
		params: {
			members: numberParam("Other members", { min: 0, max: 7, default: 4 }),
		},
		run: async ({ members }) => {
			const memberUserIds = await freshUserIds(members + 1);
			const team = await TeamFactory.create({
				name: `Dev Squad ${freshSuffix()}`,
				memberUserIds,
			});

			return { userId: memberUserIds[0], path: teamPage(team.customUrl) };
		},
	}),
	defineScenario({
		id: "banned-user",
		title: "Banned user",
		description:
			"Banned by an admin, so every page sends you to the suspended page.",
		category: "Users & teams",
		params: {
			duration: selectParam(
				"Ban",
				[
					{ value: "one-day", label: "Lifts in a day" },
					{ value: "permanent", label: "Permanent" },
				],
				"one-day",
			),
		},
		run: async ({ duration }) => {
			const user = await UserFactory.create(
				{ discordId: freshDiscordId() },
				{
					ban: {
						banned: duration === "permanent" ? 1 : addDays(new Date(), 1),
						bannedReason: "Made up by the dev tools",
						bannedByUserId: ADMIN_ID,
					},
				},
			);

			return { userId: user.id, path: "/" };
		},
	}),
	defineScenario({
		id: "plus-voting",
		title: "Plus server voting",
		description:
			"You are a +1 member voting on the other members and the players suggested for +1.",
		category: "Plus server",
		params: {
			members: numberParam("Other +1 members", {
				min: 1,
				max: 30,
				default: 8,
			}),
			suggested: numberParam("Suggested players", {
				min: 0,
				max: 10,
				default: 3,
			}),
		},
		run: async ({ members, suggested }) => {
			const memberIds = await freshUserIds(members + 1, { plusTier: 1 });
			const suggestedIds = await freshUserIds(suggested);

			for (const [index, suggestedId] of suggestedIds.entries()) {
				await PlusSuggestionFactory.create({
					authorId: memberIds[(index % members) + 1],
					suggestedId,
					tier: 1,
				});
			}

			return { userId: memberIds[0], path: PLUS_VOTING_PAGE };
		},
	}),
];

let runHistory: Array<
	ScenarioResult & { scenarioId: string; title: string; ranAt: number }
> = [];
let freshCounter = 0;

/** Every scenario with its parameters, in the order shown in the dev toolbar. */
export function list() {
	return SCENARIOS.map(({ id, title, description, category, params }) => ({
		id,
		title,
		description,
		category,
		params: Object.entries(params).map(([key, spec]) => ({ key, ...spec })),
	}));
}

/**
 * Builds the scenario's state out of fresh users through the factories, leaving existing data untouched,
 * with web pushes off. Parameters left out take their default, numbers may come as strings (from the CLI).
 * The server's caches are not refreshed, the caller does that.
 */
export async function run(
	scenarioId: string,
	rawParams: Record<string, unknown> = {},
): Promise<
	| { status: "ok"; result: ScenarioResult }
	| { status: "unknown-scenario" }
	| { status: "invalid-params"; message: string }
> {
	const scenario = SCENARIOS.find((candidate) => candidate.id === scenarioId);
	if (!scenario) return { status: "unknown-scenario" };

	const resolved = resolveParams(scenario.params, rawParams);
	if (typeof resolved === "string") {
		return { status: "invalid-params", message: resolved };
	}

	// resolveParams checked the values against the very specs the scenario's types come from
	const values = resolved as ParamValues<Record<string, ParamSpec>>;
	const result = await runWithoutWebPush(() => scenario.run(values));

	runHistory = [
		{
			...result,
			scenarioId: scenario.id,
			title: scenario.title,
			ranAt: Date.now(),
		},
		...runHistory,
	].slice(0, MAX_RECENT_RUNS);

	return { status: "ok", result };
}

/** The latest scenario runs of this server process, newest first. */
export function recentRuns() {
	return runHistory;
}

function defineScenario<const Params extends Record<string, ParamSpec>>(
	definition: Scenario<Params>,
): Scenario {
	return definition;
}

function numberParam(
	label: string,
	{ min, max, default: defaultValue }: Omit<NumberParam, "kind" | "label">,
): NumberParam {
	return { kind: "number", label, min, max, default: defaultValue };
}

function selectParam<const Value extends string>(
	label: string,
	options: ReadonlyArray<{ value: Value; label: string }>,
	defaultValue: NoInfer<Value>,
): SelectParam<Value> {
	return { kind: "select", label, options, default: defaultValue };
}

/** The parameter values, or a message saying which one is wrong. */
function resolveParams(
	specs: Record<string, ParamSpec>,
	rawParams: Record<string, unknown>,
): Record<string, string | number> | string {
	const unknownKey = Object.keys(rawParams).find((key) => !(key in specs));
	if (unknownKey) {
		return `Unknown parameter "${unknownKey}", expected one of: ${Object.keys(specs).join(", ") || "none"}`;
	}

	const resolved: Record<string, string | number> = {};
	for (const [key, spec] of Object.entries(specs)) {
		const raw = rawParams[key];
		if (raw === undefined || raw === "") {
			resolved[key] = spec.default;
			continue;
		}

		if (spec.kind === "number") {
			const value = Number(raw);
			if (!Number.isInteger(value) || value < spec.min || value > spec.max) {
				return `"${key}" must be a whole number from ${spec.min} to ${spec.max}`;
			}
			resolved[key] = value;
			continue;
		}

		const option = spec.options.find((candidate) => candidate.value === raw);
		if (!option) {
			return `"${key}" must be one of: ${spec.options.map((candidate) => candidate.value).join(", ")}`;
		}
		resolved[key] = option.value;
	}

	return resolved;
}

function freshSuffix() {
	freshCounter++;

	return `${Date.now().toString(36)}${freshCounter.toString(36)}`;
}

/** The factories' sequence restarts with the process, so its default ids would collide with already seeded users. */
function freshDiscordId() {
	freshCounter++;

	return `${Date.now()}${String(freshCounter).padStart(5, "0")}`;
}

async function freshUserIds(
	count: number,
	options?: Parameters<typeof UserFactory.create>[1],
) {
	const users = await UserFactory.createMany(
		count,
		() => ({ discordId: freshDiscordId() }),
		options,
	);

	return users.map((user) => user.id);
}

async function registerTeams(
	tournamentId: number,
	count: number,
	{ isCheckedIn }: { isCheckedIn: boolean },
) {
	const teams: Awaited<ReturnType<typeof TournamentTeamFactory.create>>[] = [];
	for (let teamNth = 1; teamNth <= count; teamNth++) {
		teams.push(
			await TournamentTeamFactory.create(
				{
					tournamentId,
					team: {
						name: `Team ${teamNth}`,
						prefersNotToHost: 0,
						teamId: null,
					},
					memberUserIds: await freshUserIds(FULL_GROUP_SIZE),
				},
				{ isCheckedIn },
			),
		);
	}

	return teams;
}

/** Users with a filled match profile, as the LFG cards show them. */
async function freshShowcaseUserIds(count: number) {
	const userIds: number[] = [];
	for (let i = 0; i < count; i++) {
		const user = await UserFactory.create(
			{ discordId: freshDiscordId() },
			showcaseOptions(),
		);
		userIds.push(user.id);
	}

	return userIds;
}

/** Registration open for two more hours, LFG is on by default. */
async function lfgTournamentId() {
	const [organizerId] = await freshUserIds(1);
	const tournament = await TournamentFactory.create({
		authorId: organizerId,
		startTimes: [dateToDatabaseTimestamp(addHours(new Date(), 2))],
	});

	return tournament.id;
}

/** Solo players and teams short of players in the LFG queue, the first `likingCount` of them liking `likedTeamId`. */
async function lookingGroupIds(
	tournamentId: number,
	{
		count,
		likingCount = 0,
		likedTeamId,
	}: { count: number; likingCount?: number; likedTeamId?: number },
) {
	const groupIds: number[] = [];
	for (let i = 0; i < count; i++) {
		const likedTeamIds =
			i < likingCount && likedTeamId !== undefined ? [likedTeamId] : [];
		const memberUserIds = await freshShowcaseUserIds(
			LOOKING_GROUP_SIZES[i % LOOKING_GROUP_SIZES.length],
		);

		const group =
			memberUserIds.length === 1
				? await TournamentLFGTeamFactory.create(
						{
							tournamentId,
							userId: memberUserIds[0],
							lfgNote: i % 2 === 0 ? showcaseNames.postText() : undefined,
						},
						{ likedTeamIds },
					)
				: await TournamentTeamFactory.create(
						{ tournamentId, memberUserIds },
						{ isLooking: true, likedTeamIds },
					);
		groupIds.push(group.id);
	}

	return groupIds;
}

/** First match of the started bracket with two teams, i.e. not a BYE. */
async function firstPlayableMatch(tournamentId: number) {
	const tournament = await tournamentFromDB(tournamentId);
	const match = tournament
		.bracketByIdx(0)
		?.data.match.find(
			(candidate) =>
				typeof candidate.opponent1?.id === "number" &&
				typeof candidate.opponent2?.id === "number",
		);
	invariant(
		typeof match?.opponent1?.id === "number",
		"Started bracket has no playable match",
	);

	return { matchId: match.id, teamId: match.opponent1.id };
}

function scrimUsers(userIds: number[]) {
	return userIds.map((userId, index) => ({
		userId,
		isOwner: toDBBoolean(index === 0),
	}));
}
