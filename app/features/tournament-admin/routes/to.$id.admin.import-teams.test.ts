import { beforeEach, describe, expect, test } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import { wrappedLoader } from "~/utils/Test";
import { tournamentAdminImportTeamsPage } from "../tournament-admin-urls";
import {
	type ImportTeamsLoaderData,
	loader,
} from "./to.$id.admin.import-teams";

const importTeamsLoader = wrappedLoader<ImportTeamsLoaderData>({ loader });

const users = UserFactory.pool();
const organizerId = () => users.id(1);
const mixedTeamPlayerId = () => users.id(2);
const realTeamPlayerId = () => users.id(3);

describe("import teams loader", () => {
	beforeEach(async () => {
		await users.create(3);
		await UserFactory.createFakePlayerPool();
	});

	test("leaves out fake players, and the teams with nobody else", async () => {
		const source = await TournamentFactory.create({
			authorId: organizerId(),
			isTest: true,
			minMembersPerTeam: 2,
		});
		const target = await TournamentFactory.create({
			authorId: organizerId(),
		});
		await TournamentTeamFactory.createFakeTeams({
			tournamentId: source.id,
			count: 2,
		});
		const lastFakePlayer = await db
			.selectFrom("User")
			.select("User.id")
			.where("User.isFakePlayer", "=", 1)
			.orderBy("User.id", "desc")
			.executeTakeFirstOrThrow();
		const mixedTeam = await TournamentTeamFactory.create({
			tournamentId: source.id,
			memberUserIds: [mixedTeamPlayerId(), lastFakePlayer.id],
		});
		const realTeam = await TournamentTeamFactory.create({
			tournamentId: source.id,
			memberUserIds: [realTeamPlayerId()],
		});

		const data = await importTeamsLoader({
			user: organizerId(),
			params: { id: String(target.id) },
			url: tournamentAdminImportTeamsPage({
				tournamentId: target.id,
				fromTournamentId: source.id,
			}),
		});

		expect(
			data.teams.map((team) => ({
				id: team.id,
				memberUserIds: team.members.map((member) => member.userId),
			})),
		).toEqual(
			expect.arrayContaining([
				{ id: mixedTeam.id, memberUserIds: [mixedTeamPlayerId()] },
				{ id: realTeam.id, memberUserIds: [realTeamPlayerId()] },
			]),
		);
		expect(data.teams).toHaveLength(2);
	});
});
