import { beforeEach, describe, expect, test } from "vitest";
import { actAs } from "~/db/seed/core/actAs";
import * as TeamFactory from "~/db/seed/factories/TeamFactory";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import * as FeedRepository from "~/features/feed/FeedRepository.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import { databaseTimestampNow } from "~/utils/dates";
import * as TeamRepository from "./TeamRepository.server";
import { TEAM } from "./team-constants";

describe("findResultsById", () => {
	test("participant who was on the roster at the result's time but left later is not a sub", async () => {
		const [owner, formerMember] = await UserFactory.createMany(2);
		const team = await TeamFactory.create({
			memberUserIds: [owner.id, formerMember.id],
		});

		const tournament = await TournamentFactory.create({ authorId: owner.id });
		const tournamentTeam = await TournamentTeamFactory.create({
			tournamentId: tournament.id,
			memberUserIds: [owner.id, formerMember.id],
			team: {
				name: team.name,
				prefersNotToHost: 0,
				teamId: team.id,
			},
		});

		await TournamentRepository.finalize({
			tournamentId: tournament.id,
			season: undefined,
			summary: {
				skills: [],
				seedingSkills: [],
				mapResultDeltas: [],
				playerResultDeltas: [],
				tournamentResults: [owner.id, formerMember.id].map((userId) => ({
					userId,
					placement: 1,
					participantCount: 8,
					tournamentTeamId: tournamentTeam.id,
					div: null,
				})),
				setResults: new Map(),
			},
		});

		const { startsAt } = await db
			.selectFrom("CalendarEventDate")
			.select("startsAt")
			.where("eventId", "=", tournament.eventId)
			.executeTakeFirstOrThrow();

		// biome-ignore lint/plugin: a membership spanning a past event start only arises with the passage of time; `backdate` can't address AllTeamMember as it has no id column
		await db
			.updateTable("AllTeamMember")
			.set({ createdAt: startsAt - 1000, leftAt: startsAt + 1000 })
			.where("teamId", "=", team.id)
			.where("userId", "=", formerMember.id)
			.execute();

		const results = await TeamRepository.findResultsById(team.id);

		expect(results).toHaveLength(1);
		expect(results[0].subs).toHaveLength(0);
	});
});

describe("insertOwnMembership", () => {
	const users = UserFactory.pool();
	const ownerId = () => users.id(1);
	const rejoinerId = () => users.id(2);

	beforeEach(async () => {
		await users.create(2);
	});

	const leaveAndRejoin = async (teamId: number) => {
		await TeamRepository.handleMemberLeaving({ userId: rejoinerId(), teamId });
		await actAs(rejoinerId(), () =>
			TeamRepository.insertOwnMembership({
				teamId,
				maxTeamsAllowed: TEAM.MAX_TEAM_COUNT_NON_PATRON,
			}),
		);
	};

	test.each([
		{ why: "preset role", role: "COACH" as const },
		{
			why: "custom role",
			role: { customRole: "Analyst", roleType: "OTHER" as const },
		},
	])("a rejoining member does not get their $why back", async ({ role }) => {
		const team = await TeamFactory.create(
			{ memberUserIds: [ownerId(), rejoinerId()] },
			{ roles: { [rejoinerId()]: role } },
		);

		await leaveAndRejoin(team.id);

		const rejoiner = (
			await TeamRepository.findByCustomUrl(team.customUrl)
		)?.members.find((member) => member.id === rejoinerId());
		expect(rejoiner).toMatchObject({
			role: null,
			customRole: null,
			roleType: null,
		});
	});

	test("a rejoin counts as a fresh team join", async () => {
		const team = await TeamFactory.create({
			memberUserIds: [ownerId(), rejoinerId()],
		});
		const firstJoinedAt = databaseTimestampNow() - 60 * 60 * 24 * 30;
		// biome-ignore lint/plugin: a membership from a month ago only arises with the passage of time; `backdate` can't address AllTeamMember as it has no id column
		await db
			.updateTable("AllTeamMember")
			.set({ createdAt: firstJoinedAt })
			.where("teamId", "=", team.id)
			.where("userId", "=", rejoinerId())
			.execute();

		await leaveAndRejoin(team.id);

		const joins = await FeedRepository.findAllTeamJoinsAfter(
			databaseTimestampNow() - 60,
		);
		expect(joins.map((join) => join.userId)).toContain(rejoinerId());
	});
});

describe("findAllByMemberUserId", () => {
	test("returns the main team first", async () => {
		const user = await UserFactory.create();
		await TeamFactory.create({
			name: "Secondary team",
			isMainTeam: false,
			memberUserIds: [user.id],
		});
		await TeamFactory.create({
			name: "Main team",
			isMainTeam: true,
			memberUserIds: [user.id],
		});

		const teams = await TeamRepository.findAllByMemberUserId(user.id);

		expect(teams.map((team) => team.name)).toEqual([
			"Main team",
			"Secondary team",
		]);
	});
});
