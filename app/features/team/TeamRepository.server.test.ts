import { beforeEach, describe, expect, test } from "vitest";
import * as TeamFactory from "~/db/seed/factories/TeamFactory";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import * as TeamRepository from "./TeamRepository.server";

describe("TeamRepository.findResultsById", () => {
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

describe("TeamRepository.teams", () => {
	const users = UserFactory.pool();

	const ownerId = () => users.id(1);
	const managerId = () => users.id(2);
	const coachId = () => users.id(3);

	beforeEach(async () => {
		await users.create(3);
	});

	test("leaves out soft-deleted teams", async () => {
		const team = await TeamFactory.create({ memberUserIds: [ownerId()] });
		await TeamFactory.create(
			{ memberUserIds: [managerId()] },
			{ isDeleted: true },
		);

		const result = await TeamRepository.teams().execute();

		expect(result.map((row) => row.id)).toEqual([team.id]);
	});

	test("includingDeleted lists soft-deleted teams too", async () => {
		const deleted = await TeamFactory.create(
			{ memberUserIds: [ownerId()] },
			{ isDeleted: true },
		);

		const result = await TeamRepository.teams()
			.where({ id: deleted.id })
			.includingDeleted()
			.execute();

		expect(result.map((row) => row.id)).toEqual([deleted.id]);
	});

	test("forMember returns the main team first", async () => {
		await TeamFactory.create({
			name: "A secondary team",
			isMainTeam: false,
			memberUserIds: [ownerId()],
		});
		await TeamFactory.create({
			name: "Main team",
			isMainTeam: true,
			memberUserIds: [ownerId()],
		});

		const result = await TeamRepository.teams().forMember(ownerId()).execute();

		expect(result.map((team) => team.name)).toEqual([
			"Main team",
			"A secondary team",
		]);
	});

	test("withPlayers leaves out members with a staff role", async () => {
		await TeamFactory.create(
			{ memberUserIds: [ownerId(), coachId()] },
			{ roles: { [coachId()]: "COACH" } },
		);

		const [team] = await TeamRepository.teams().withPlayers().execute();

		expect(team.players.map((player) => player.id)).toEqual([ownerId()]);
	});

	test("withPermissions lets the owner and managers edit, only the owner delete", async () => {
		await TeamFactory.create(
			{ memberUserIds: [ownerId(), managerId(), coachId()] },
			{ managerUserIds: [managerId()] },
		);

		const [team] = await TeamRepository.teams()
			.withMembers()
			.withPermissions()
			.execute();

		expect(team.permissions).toEqual({
			EDIT: [ownerId(), managerId()],
			MANAGE_ROSTER: [ownerId(), managerId()],
			DELETE: [ownerId()],
		});
	});
});
