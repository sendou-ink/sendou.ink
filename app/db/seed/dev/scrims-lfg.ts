import { add } from "date-fns";
import { databaseTimestampNow, dateToDatabaseTimestamp } from "~/utils/dates";
import { faker } from "../core/faker";
import * as showcaseNames from "../core/showcaseNames";
import * as AssociationFactory from "../factories/AssociationFactory";
import * as LFGPostFactory from "../factories/LFGPostFactory";
import * as ScrimPostFactory from "../factories/ScrimPostFactory";
import type { SeededTeams } from "./teams";
import type { SeededUsers } from "./users";

const SCRIM_POST_COUNT = 20;
const LFG_POST_COUNT = 9;
const ASSOCIATION_COUNT = 3;

export async function seedScrimsAndLFG(users: SeededUsers, teams: SeededTeams) {
	await seedScrimPosts(users, teams);
	await seedLFGPosts(users, teams);
	await seedAssociations(users);
}

async function seedScrimPosts(users: SeededUsers, teams: SeededTeams) {
	const userPool = [...users.showcaseIds, ...users.crowdIds];
	let next = 0;
	const takeUsers = (count: number) => {
		const taken = userPool.slice(next, next + count);
		next += count;

		return taken.map((userId, i) => ({
			userId,
			isOwner: i === 0 ? (1 as const) : (0 as const),
		}));
	};

	// an accepted scrim between the admin's and N-ZAP's rosters
	await ScrimPostFactory.create(
		{
			startsAt: dateToDatabaseTimestamp(add(new Date(), { hours: 2 })),
			isScheduledForFuture: true,
			managedByAnyone: true,
			users: [{ userId: users.adminId, isOwner: 1 }, ...takeUsers(3)],
		},
		{
			requests: [
				{
					users: [{ userId: users.nzapId, isOwner: 1 }, ...takeUsers(3)],
					isAccepted: true,
				},
			],
		},
	);

	for (let i = 0; i < SCRIM_POST_COUNT; i++) {
		const divs = faker.number.float(1) < 0.8 ? fakeDivRange() : null;
		const startsAt =
			faker.number.float(1) < 0.5
				? databaseTimestampNow()
				: dateToDatabaseTimestamp(
						faker.date.between({
							from: new Date(),
							to: add(new Date(), { days: 7 }),
						}),
					);

		await ScrimPostFactory.create(
			{
				startsAt,
				isScheduledForFuture: true,
				managedByAnyone: true,
				maxDiv: divs?.maxDiv,
				minDiv: divs?.minDiv,
				teamId:
					faker.number.float(1) < 0.4
						? faker.helpers.arrayElement(teams.ids)
						: null,
				text: faker.number.float(1) < 0.5 ? showcaseNames.postText() : null,
				maps: faker.helpers.arrayElement(["SZ", "ALL", "RANKED", null, null]),
				users: takeUsers(faker.helpers.arrayElement([4, 4, 4, 5, 5, 6])),
			},
			{
				requests: i < 3 ? [{ users: takeUsers(4) }] : undefined,
			},
		);
	}
}

async function seedLFGPosts(users: SeededUsers, teams: SeededTeams) {
	const authorIds = [
		users.adminId,
		...faker.helpers.arrayElements(
			[...users.showcaseIds, ...users.crowdIds],
			LFG_POST_COUNT - 2,
		),
	];

	for (const authorId of authorIds) {
		await LFGPostFactory.create({
			authorId,
			text: showcaseNames.postText(),
		});
	}

	// posted by the owner of the team it is looking for players for
	await LFGPostFactory.create({
		authorId: users.nzapId,
		type: "TEAM_FOR_PLAYER",
		teamId: teams.allianceRogueId,
		timezone: "Europe/Stockholm",
	});
}

async function seedAssociations(users: SeededUsers) {
	for (let i = 0; i < ASSOCIATION_COUNT; i++) {
		const ownerId =
			i === ASSOCIATION_COUNT - 1
				? faker.helpers.arrayElement(users.showcaseIds)
				: users.adminId;

		await AssociationFactory.create(
			{ name: faker.company.name(), userId: ownerId },
			{
				memberUserIds: [
					...(ownerId === users.adminId ? [] : [users.adminId]),
					...faker.helpers.arrayElements(
						users.showcaseIds.filter((id) => id !== ownerId),
						faker.helpers.arrayElement([6, 10, 16]),
					),
				],
			},
		);
	}
}

function fakeDivRange() {
	return {
		maxDiv: faker.helpers.arrayElement([0, 1, 2, 3, 4, 5]),
		minDiv: faker.helpers.arrayElement([6, 7, 8, 9, 10, 11]),
	};
}
