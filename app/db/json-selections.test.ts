import { sql } from "kysely";
import { describe, expect, test } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import { commonUserSelect, jsonArrayFrom } from "~/utils/kysely.server";
import { withUserId } from "~/utils/Test";
import { computedJsonColumns } from "./json-selections";
import { db } from "./sql";
import type { Tables } from "./tables";

const JSON_SHAPED_TEXT = '{"note":"gg"}';

describe("computedJsonColumns", () => {
	test("recognizes a json helper selection but not a coalesce over user text", () => {
		const query = db
			.selectFrom("User")
			.select((eb) => [
				...commonUserSelect(eb, { inTournament: true }),
				jsonArrayFrom(
					eb
						.selectFrom("UserWeapon")
						.select("UserWeapon.weaponSplId")
						.whereRef("UserWeapon.userId", "=", "User.id"),
				).as("weapons"),
			]);

		// `username` is `coalesce("User"."tournamentName", "User"."username")`, which
		// SQLite reports the same way as the weapons subquery: as a computed column
		expect(computedJsonColumns(query.compile().query)).toEqual(
			new Set(["weapons"]),
		);
	});

	test("recognizes a json column contributed by another branch of a compound select", () => {
		const query = db
			.selectFrom("CalendarEventResultTeam")
			.select([
				sql<Tables["TournamentResult"]["setResults"]>`null`.as("setResults"),
			])
			.unionAll(
				db.selectFrom("TournamentResult").select("TournamentResult.setResults"),
			);

		expect(computedJsonColumns(query.compile().query)).toEqual(
			new Set(["setResults"]),
		);
	});

	test("recognizes a json selection passed through a derived table", () => {
		const query = db
			.selectFrom((eb) =>
				eb
					.selectFrom("Build")
					.select((innerEb) => [
						"Build.id",
						jsonArrayFrom(
							innerEb
								.selectFrom("BuildWeapon")
								.select("BuildWeapon.weaponSplId")
								.whereRef("BuildWeapon.buildId", "=", "Build.id"),
						).as("weapons"),
					])
					.as("Inner"),
			)
			.select(["Inner.id", "Inner.weapons"]);

		expect(computedJsonColumns(query.compile().query)).toEqual(
			new Set(["weapons"]),
		);
	});
});

describe("reading rows", () => {
	test("keeps a JSON-object-shaped in-tournament name as text", async () => {
		const [organizer, member] = await UserFactory.createMany(2);
		const tournament = await TournamentFactory.create({
			authorId: organizer.id,
		});

		await withUserId(organizer.id, () =>
			TournamentTeamRepository.upsertRegistration({
				tournamentId: tournament.id,
				name: "Team Olive",
				teamId: null,
				avatarImgId: null,
				ownerUserId: member.id,
				ownerChange: null,
				membersToAdd: [member.id],
				membersToRemove: [],
				inGameNameUpdates: [],
				tournamentNameUpdates: [
					{ userId: member.id, tournamentName: JSON_SHAPED_TEXT },
				],
			}),
		);

		const row = await db
			.selectFrom("User")
			.select((eb) => commonUserSelect(eb, { inTournament: true }))
			.where("User.id", "=", member.id)
			.executeTakeFirstOrThrow();

		// rendered as a bare JSX child on public tournament pages, so an object here
		// is "Objects are not valid as a React child" for everyone viewing them
		expect(row.username).toBe(JSON_SHAPED_TEXT);
	});

	test("parses json columns and json helper selections", async () => {
		const user = await UserFactory.create(undefined, {
			matchProfile: { languages: ["en", "ja"] },
		});

		const row = await db
			.selectFrom("User")
			.select((eb) => [
				"User.languages",
				jsonArrayFrom(
					eb
						.selectFrom("User as Self")
						.select("Self.id")
						.whereRef("Self.id", "=", "User.id"),
				).as("self"),
			])
			.where("User.id", "=", user.id)
			.executeTakeFirstOrThrow();

		expect(row.languages).toEqual(["en", "ja"]);
		expect(row.self).toEqual([{ id: user.id }]);
	});
});
