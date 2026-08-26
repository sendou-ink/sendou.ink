import { describe, expect, test } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import { wrappedAction } from "~/utils/Test";
import type { adminSeedsActionSchema } from "../tournament-admin-schemas";
import { action } from "./to.$id.admin.seeds.server";

const seedsAction = wrappedAction<typeof adminSeedsActionSchema>({ action });

const teamRow = (tournamentTeamId: number) =>
	db
		.selectFrom("TournamentTeam")
		.select(["id", "tournamentId", "seed", "startingBracketIdx"])
		.where("id", "=", tournamentTeamId)
		.executeTakeFirstOrThrow();

describe("tournament seeds admin action", () => {
	test("does not touch the seeds of a team of another tournament", async () => {
		await UserFactory.createAdmin();
		const attacker = await UserFactory.createRegular();
		const victimTo = await UserFactory.create();
		const [player] = await UserFactory.createMany(1);

		// the attacker organizes a tournament of their own
		const ownTournament = await TournamentFactory.create({
			authorId: attacker.id,
		});

		// somebody else's tournament, with a team they seeded themselves
		const otherTournament = await TournamentFactory.create({
			authorId: victimTo.id,
		});
		const otherTeam = await TournamentTeamFactory.create({
			tournamentId: otherTournament.id,
			memberUserIds: [player.id],
		});

		await seedsAction(
			{ _action: "UPDATE_SEEDS", seeds: JSON.stringify([otherTeam.id]) as any },
			{ user: "regular", params: { id: String(ownTournament.id) } },
		);

		const after = await teamRow(otherTeam.id);
		expect(after.tournamentId).toBe(otherTournament.id);
		expect(after.seed, "another tournament's team got seeded").toBeNull();
	});

	test("does not touch the starting bracket of a team of another tournament", async () => {
		await UserFactory.createAdmin();
		const attacker = await UserFactory.createRegular();
		const victimTo = await UserFactory.create();
		const [player] = await UserFactory.createMany(1);

		const ownTournament = await TournamentFactory.create({
			authorId: attacker.id,
		});

		const otherTournament = await TournamentFactory.create({
			authorId: victimTo.id,
		});
		const otherTeam = await TournamentTeamFactory.create({
			tournamentId: otherTournament.id,
			memberUserIds: [player.id],
		});

		await seedsAction(
			{
				_action: "UPDATE_STARTING_BRACKETS",
				startingBrackets: JSON.stringify([
					{ tournamentTeamId: otherTeam.id, startingBracketIdx: 0 },
				]) as any,
			},
			{ user: "regular", params: { id: String(ownTournament.id) } },
		);

		const after = await teamRow(otherTeam.id);
		expect(
			after.startingBracketIdx,
			"another tournament's team got moved to a starting bracket",
		).toBeNull();
	});
});
