import { describe, expect, test } from "vitest";
import * as TeamFactory from "~/db/seed/factories/TeamFactory";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import * as TeamRepository from "./TeamRepository.server";

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
