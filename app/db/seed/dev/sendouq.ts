import { sub } from "date-fns";
import { FULL_GROUP_SIZE, SENDOUQ } from "~/features/sendouq/q-constants";
import invariant from "~/utils/invariant";
import { faker } from "../core/faker";
import * as SQGroupFactory from "../factories/SQGroupFactory";
import * as SQMatchFactory from "../factories/SQMatchFactory";
import * as SQReportedWeaponFactory from "../factories/SQReportedWeaponFactory";
import type { SeededTeams } from "./teams";
import type { SeededUsers } from "./users";

const RECENT_MATCH_COUNT = 300;
const OLDER_MATCH_COUNT = 140;
const SQUAD_COUNT = 8;
const LOOKING_GROUP_COUNT = 10;
const REPORTED_MAP_COUNT = 4;

/** N-ZAP's unconfirmed match, on an id worth remembering. Every other match is
 * created before it, so the squad matches make up the difference. */
const NZAP_MATCH_ID = 500;
const SQUAD_MATCH_COUNT =
	NZAP_MATCH_ID - 1 - RECENT_MATCH_COUNT - OLDER_MATCH_COUNT;

export type SeededSendouQ = {
	recentMatchIds: number[];
};

export async function seedSendouQ(
	users: SeededUsers,
	teams: SeededTeams,
): Promise<SeededSendouQ> {
	const playerIds = users.showcaseIds;

	const recentMatchIds: number[] = [];
	for (let i = 0; i < RECENT_MATCH_COUNT; i++) {
		const match = await seedConcludedMatch(
			playerIds,
			sub(new Date(), {
				days: faker.number.int({ min: 0, max: 60 }),
				hours: faker.number.int({ min: 0, max: 23 }),
			}),
		);
		recentMatchIds.push(match.id);
	}

	for (let i = 0; i < OLDER_MATCH_COUNT; i++) {
		await seedConcludedMatch(
			playerIds,
			sub(new Date(), {
				days: faker.number.int({ min: 61, max: 600 }),
				hours: faker.number.int({ min: 0, max: 23 }),
			}),
		);
	}

	await seedSquadMatches(teams);
	await seedNzapReportedMatch(users, teams);
	await seedNzapCanceledMatches(users, teams);
	await seedLookingGroups(users);

	return { recentMatchIds };
}

/** A match N-ZAP's team has reported but the other has not confirmed, so it is the
 * other team's to report and N-ZAP's group is free to queue again. His side is
 * Alliance Rogue's lineup, so the match is one of a team against a pickup group. */
async function seedNzapReportedMatch(users: SeededUsers, teams: SeededTeams) {
	const opponentIds = users.crowdIds.slice(-88, -84);

	const match = await SQMatchFactory.create(
		{
			alphaUserIds: allianceRogueLineup(teams),
			bravoUserIds: opponentIds,
			isMatchmade: true,
		},
		{ isReported: true, createdAt: sub(new Date(), { hours: 1 }) },
	);

	invariant(
		match.id === NZAP_MATCH_ID,
		`N-ZAP's match was created on id ${match.id}, not ${NZAP_MATCH_ID}`,
	);
}

/** One canceled match of each form the cancel reports take, so that the staff-only
 * views have every one of them to show: the two teams pointing at the same player,
 * at different ones, and a match staff canceled without either team's account of it. */
async function seedNzapCanceledMatches(users: SeededUsers, teams: SeededTeams) {
	const [nzapId, ...teammateIds] = allianceRogueLineup(teams);
	const opponentIds = users.crowdIds.slice(-104, -88);
	const opponentGroup = (nth: number) =>
		opponentIds.slice(nth * FULL_GROUP_SIZE, (nth + 1) * FULL_GROUP_SIZE);

	await SQMatchFactory.create(
		{
			alphaUserIds: [nzapId, ...teammateIds],
			bravoUserIds: opponentGroup(0),
			isMatchmade: true,
		},
		{
			cancel: {
				requested: {
					reason:
						"Their player never came back to the lobby after the second map. Waited 15 minutes and then gave up.",
					nominatedUserIds: [opponentGroup(0)[2]],
				},
				accepted: {
					reason:
						"Our teammate's console crashed and he couldn't get back online. Sorry for wasting everyone's time.",
					nominatedUserIds: [opponentGroup(0)[2]],
				},
			},
			createdAt: sub(new Date(), { days: 2, hours: 4 }),
		},
	);

	await SQMatchFactory.create(
		{
			alphaUserIds: opponentGroup(1),
			bravoUserIds: [nzapId, ...teammateIds],
			isMatchmade: true,
		},
		{
			cancel: {
				requested: {
					reason: "Opponent left the lobby after going down 0-2.",
					nominatedUserIds: [nzapId],
				},
				accepted: {
					reason:
						"Power outage on my end, nothing intentional. They were flaming in chat the whole set before that.",
					nominatedUserIds: [opponentGroup(1)[0], opponentGroup(1)[3]],
				},
			},
			createdAt: sub(new Date(), { days: 9, hours: 11 }),
		},
	);

	// a teammate owns the group, so that the report against N-ZAP is his own team's
	await SQMatchFactory.create(
		{
			alphaUserIds: opponentGroup(2),
			bravoUserIds: [...teammateIds, nzapId],
			isMatchmade: true,
		},
		{
			cancel: {
				requested: {
					reason: maxLengthCancelReason(),
					nominatedUserIds: [nzapId, opponentGroup(2)[1]],
				},
				accepted: {
					reason: "N-ZAP had to leave for work mid-set, our bad.",
					nominatedUserIds: [nzapId],
				},
			},
			createdAt: sub(new Date(), { days: 20, hours: 2 }),
		},
	);

	await SQMatchFactory.create(
		{
			alphaUserIds: [nzapId, ...teammateIds],
			bravoUserIds: opponentGroup(3),
			isMatchmade: true,
		},
		{
			canceledByStaffUserId: users.staffId,
			createdAt: sub(new Date(), { days: 35, hours: 7 }),
		},
	);
}

/** A reason at the exact max length, for how a wall of text lays out. */
function maxLengthCancelReason() {
	return faker.lorem
		.paragraphs(5)
		.replaceAll("\n", " ")
		.slice(0, SENDOUQ.CANCEL_REASON_MAX_LENGTH);
}

function allianceRogueLineup(teams: SeededTeams) {
	const allianceRogue = teams.squads.find(
		(squad) => squad.teamId === teams.allianceRogueId,
	);
	invariant(allianceRogue, "Alliance Rogue has no full lineup");

	return allianceRogue.memberUserIds;
}

/** Fixed team lineups playing together repeatedly, so their identifier skills reach
 * the match count the team leaderboard requires. */
async function seedSquadMatches(teams: SeededTeams) {
	const squads = teams.squads.slice(0, SQUAD_COUNT);

	for (let i = 0; i < SQUAD_MATCH_COUNT; i++) {
		const [alpha, bravo] = faker.helpers.arrayElements(squads, 2);

		await SQMatchFactory.create(
			{
				alphaUserIds: alpha.memberUserIds,
				bravoUserIds: bravo.memberUserIds,
			},
			{
				isConcluded: true,
				createdAt: sub(new Date(), {
					days: faker.number.int({ min: 0, max: 45 }),
					hours: faker.number.int({ min: 0, max: 23 }),
				}),
			},
		);
	}
}

async function seedConcludedMatch(playerIds: number[], createdAt: Date) {
	const players = faker.helpers.arrayElements(playerIds, 8);

	const match = await SQMatchFactory.create(
		{
			alphaUserIds: players.slice(0, 4),
			bravoUserIds: players.slice(4),
		},
		{ isConcluded: true, createdAt, confirmedAt: createdAt },
	);

	if (faker.number.float(1) < 0.7) {
		// the first four maps are always played, whoever won
		await SQReportedWeaponFactory.createMany(
			players.length * REPORTED_MAP_COUNT,
			(i) => ({
				groupMatchId: match.id,
				mapIndex: Math.floor(i / players.length),
				userId: players[i % players.length],
			}),
		);
	}

	return match;
}

async function seedLookingGroups(users: SeededUsers) {
	// the tail of the crowd is free of tournament rosters, so these read as their own scene
	const availableUserIds = [users.nzapId, ...users.crowdIds.slice(-80)];

	const groupIds: number[] = [];
	for (let i = 0; i < LOOKING_GROUP_COUNT; i++) {
		const memberCount =
			i === 0 ? 4 : faker.helpers.arrayElement([1, 1, 2, 3, 4]);
		const memberUserIds = availableUserIds.splice(0, memberCount);

		const group = await SQGroupFactory.create(
			{ memberUserIds },
			{
				likedByGroupIds:
					groupIds.length > 1
						? faker.helpers.arrayElements(groupIds, { min: 0, max: 2 })
						: undefined,
			},
		);

		groupIds.push(group.id);
	}
}
