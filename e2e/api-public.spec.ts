import type { Page } from "@playwright/test";
import { addHours } from "date-fns";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import { FULL_GROUP_SIZE } from "~/features/sendouq/q-constants";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import type { Factories } from "./helpers/factories";
import { expect, impersonate, test } from "./helpers/playwright";
import { ApiPage } from "./pages/api/api-page";
import { TournamentTeamPage } from "./pages/tournament/tournament-team-page";

const ROSTER_SIZE = 4;
const TOKEN_LENGTH = 20;

const authorized = (token: string) => ({
	Authorization: `Bearer ${token}`,
	"Content-Type": "application/json",
});

test.describe("Public API", () => {
	test("OPTIONS preflight request returns 204 with CORS headers", async ({
		page,
	}) => {
		const response = await page.request.fetch("/api/tournament/1", {
			method: "OPTIONS",
		});

		expect(response.status()).toBe(204);
		expect(response.headers()["access-control-allow-origin"]).toBe("*");
		expect(response.headers()["access-control-allow-methods"]).toContain("GET");
		expect(response.headers()["access-control-allow-headers"]).toContain(
			"Authorization",
		);
	});

	test("GET request includes CORS headers in response", async ({ page }) => {
		const response = await page.request.fetch("/api/tournament/1");

		expect(response.headers()["access-control-allow-origin"]).toBe("*");
	});

	test("GET user IDs endpoint works without authentication", async ({
		page,
	}) => {
		const response = await page.request.fetch(`/api/user/${ADMIN_ID}/ids`);

		expect(response.status()).toBe(200);
		const data = await response.json();
		expect(data.id).toBe(ADMIN_ID);
		expect(data.discordId).toBeTruthy();
	});

	test("creates read API token and calls public endpoint", async ({
		page,
		factories,
	}) => {
		await factories.UserFactory.grant(ADMIN_ID, { roles: ["API_ACCESSER"] });

		await impersonate(page);

		const api = new ApiPage(page);
		await api.goto();

		const token = await api.generateToken("read");
		expect(token).toHaveLength(TOKEN_LENGTH);

		const response = await page.request.fetch(`/api/user/${ADMIN_ID}`, {
			headers: authorized(token),
		});

		expect(response.status()).toBe(200);
		const data = await response.json();
		expect(data.id).toBe(ADMIN_ID);
		expect(data.name).toBe("Sendou");
	});

	test("returns active SendouQ match for user", async ({ page, factories }) => {
		const alpha = await factories.UserFactory.createMany(FULL_GROUP_SIZE);
		const bravo = await factories.UserFactory.createMany(FULL_GROUP_SIZE);
		const match = await factories.SQMatchFactory.create({
			alphaUserIds: alpha.map((user) => user.id),
			bravoUserIds: bravo.map((user) => user.id),
		});
		const token = await readToken(factories, ADMIN_ID);

		await impersonate(page);

		const response = await page.request.fetch(
			`/api/user/${alpha[0].id}/active-match`,
			{ headers: authorized(token) },
		);

		expect(response.status()).toBe(200);
		const data = await response.json();
		expect(data.matchId).toBe(match.id);
		expect(data.lobby).toBe("sendouq");
		expect(data.tournamentId).toBeNull();
		expect(data.bracketIdx).toBeNull();
	});
});

test.describe("Public API - Write endpoints", () => {
	test("adds member to tournament team via API", async ({
		page,
		factories,
	}) => {
		const { tournamentId, teamId, token } =
			await organizedTournament(factories);
		const newMember = await factories.UserFactory.create();

		await impersonate(page, ADMIN_ID);

		const response = await page.request.fetch(
			`/api/tournament/${tournamentId}/teams/${teamId}/add-member`,
			{
				method: "POST",
				headers: authorized(token),
				data: { userId: newMember.id },
			},
		);

		expect(response.status()).toBe(200);

		const teamPage = new TournamentTeamPage(page);
		await teamPage.goto(tournamentId, teamId);

		await expect(teamPage.locators.memberNames).toHaveCount(ROSTER_SIZE + 1);
	});

	test("removes member from tournament team via API", async ({
		page,
		factories,
	}) => {
		const { tournamentId, teamId, token } =
			await organizedTournament(factories);
		const newMember = await factories.UserFactory.create();

		await impersonate(page, ADMIN_ID);

		await page.request.fetch(
			`/api/tournament/${tournamentId}/teams/${teamId}/add-member`,
			{
				method: "POST",
				headers: authorized(token),
				data: { userId: newMember.id },
			},
		);

		const teamPage = new TournamentTeamPage(page);
		await teamPage.goto(tournamentId, teamId);
		await expect(teamPage.locators.memberNames).toHaveCount(ROSTER_SIZE + 1);

		const response = await page.request.fetch(
			`/api/tournament/${tournamentId}/teams/${teamId}/remove-member`,
			{
				method: "POST",
				headers: authorized(token),
				data: { userId: newMember.id },
			},
		);

		expect(response.status()).toBe(200);

		await teamPage.goto(tournamentId, teamId);
		await expect(teamPage.locators.memberNames).toHaveCount(ROSTER_SIZE);
	});

	test("returns 401 for invalid token", async ({ page, factories }) => {
		const { tournamentId, teamId } = await organizedTournament(factories);
		const newMember = await factories.UserFactory.create();

		await impersonate(page, ADMIN_ID);

		const response = await page.request.fetch(
			`/api/tournament/${tournamentId}/teams/${teamId}/add-member`,
			{
				method: "POST",
				headers: authorized("invalid-token-12345"),
				data: { userId: newMember.id },
			},
		);

		expect(response.status()).toBe(401);
		const data = await response.json();
		expect(data.error).toBe("Invalid token");
	});

	test("returns 403 when using read token for write endpoint", async ({
		page,
		factories,
	}) => {
		const { tournamentId, teamId } = await organizedTournament(factories);
		const newMember = await factories.UserFactory.create();
		const token = await readToken(factories, ADMIN_ID);

		await impersonate(page, ADMIN_ID);

		const response = await page.request.fetch(
			`/api/tournament/${tournamentId}/teams/${teamId}/add-member`,
			{
				method: "POST",
				headers: authorized(token),
				data: { userId: newMember.id },
			},
		);

		expect(response.status()).toBe(403);
		const data = await response.json();
		expect(data.error).toBe("Write token required");
	});

	test("updates tournament seeds via API", async ({ page, factories }) => {
		const { tournamentId, token } = await organizedTournament(factories, {
			teamCount: 3,
		});

		await impersonate(page, ADMIN_ID);

		const teamsResponse = await page.request.fetch(
			`/api/tournament/${tournamentId}/teams`,
			{ headers: authorized(token) },
		);
		expect(teamsResponse.status()).toBe(200);
		const teams = await teamsResponse.json();
		const reversedSeeds = teams
			.map((team: { id: number }) => team.id)
			.reverse();

		const response = await page.request.fetch(
			`/api/tournament/${tournamentId}/seeds`,
			{
				method: "POST",
				headers: authorized(token),
				data: { tournamentTeamIds: reversedSeeds },
			},
		);

		expect(response.status()).toBe(200);

		const updatedTeamsResponse = await page.request.fetch(
			`/api/tournament/${tournamentId}/teams`,
			{ headers: authorized(token) },
		);
		const updatedTeams = await updatedTeamsResponse.json();

		for (const [index, tournamentTeamId] of reversedSeeds.entries()) {
			const team = updatedTeams.find(
				(candidate: { id: number }) => candidate.id === tournamentTeamId,
			);
			expect(team.seed).toBe(index + 1);
		}
	});

	test("updates tournament starting brackets via API", async ({
		page,
		factories,
	}) => {
		const { tournamentId, teamId, token } =
			await organizedTournament(factories);

		await impersonate(page, ADMIN_ID);

		const response = await page.request.fetch(
			`/api/tournament/${tournamentId}/starting-brackets`,
			{
				method: "POST",
				headers: authorized(token),
				data: {
					startingBrackets: [
						{ tournamentTeamId: teamId, startingBracketIdx: 0 },
					],
				},
			},
		);

		expect(response.status()).toBe(200);
	});

	test("upserts tournament team registration via API", async ({
		page,
		factories,
	}) => {
		const { tournamentId, token } = await organizedTournament(factories);
		const roster = await factories.UserFactory.createMany(ROSTER_SIZE);

		await impersonate(page, ADMIN_ID);

		const createResponse = await page.request.fetch(
			`/api/tournament/${tournamentId}/teams/upsert`,
			{
				method: "POST",
				headers: authorized(token),
				data: {
					name: "Api Pickup",
					ownerUserId: roster[0].id,
					members: roster.map((user) => ({ userId: user.id })),
				},
			},
		);
		expect(createResponse.status()).toBe(200);

		const createdTeam = await teamByName(page, token, {
			tournamentId,
			name: "Api Pickup",
		});
		expect(createdTeam).toBeTruthy();
		expect(createdTeam.members).toHaveLength(ROSTER_SIZE);

		const editResponse = await page.request.fetch(
			`/api/tournament/${tournamentId}/teams/upsert`,
			{
				method: "POST",
				headers: authorized(token),
				data: {
					tournamentTeamId: createdTeam.id,
					name: "Api Pickup Edited",
					ownerUserId: roster[0].id,
					members: roster
						.slice(0, ROSTER_SIZE - 1)
						.map((user) => ({ userId: user.id })),
				},
			},
		);
		expect(editResponse.status()).toBe(200);

		const editedTeam = await teamByName(page, token, {
			tournamentId,
			name: "Api Pickup Edited",
		});
		expect(editedTeam.id).toBe(createdTeam.id);
		expect(editedTeam.members).toHaveLength(ROSTER_SIZE - 1);
	});

	test("returns 400 with field errors for invalid upsert registration body", async ({
		page,
		factories,
	}) => {
		const { tournamentId, token } = await organizedTournament(factories);
		const owner = await factories.UserFactory.create();

		await impersonate(page, ADMIN_ID);

		const response = await page.request.fetch(
			`/api/tournament/${tournamentId}/teams/upsert`,
			{
				method: "POST",
				headers: authorized(token),
				data: {
					ownerUserId: owner.id,
					members: [{ userId: owner.id }],
				},
			},
		);

		expect(response.status()).toBe(400);
		const data = await response.json();
		expect(data.fieldErrors.pickUpName).toBeTruthy();
	});

	test("updates member IGN via API", async ({ page, factories }) => {
		const { tournamentId, teamId, memberUserIds, token } =
			await organizedTournament(factories);

		await impersonate(page, ADMIN_ID);

		const response = await page.request.fetch(
			`/api/tournament/${tournamentId}/teams/${teamId}/update-member-ign`,
			{
				method: "POST",
				headers: authorized(token),
				data: { userId: memberUserIds[0], inGameName: "NewName#9999" },
			},
		);

		expect(response.status()).toBe(200);
	});

	test("returns 400 when user is not the organizer of this tournament", async ({
		page,
		factories,
	}) => {
		const { tournamentId, teamId } = await organizedTournament(factories);
		const outsider = await factories.UserFactory.create(null, {
			roles: ["API_ACCESSER"],
		});
		const newMember = await factories.UserFactory.create();
		const { token } = await factories.ApiTokenFactory.create({
			userId: outsider.id,
			type: "write",
		});

		await impersonate(page, outsider.id);

		const response = await page.request.fetch(
			`/api/tournament/${tournamentId}/teams/${teamId}/add-member`,
			{
				method: "POST",
				headers: authorized(token),
				data: { userId: newMember.id },
			},
		);

		expect(response.status()).toBe(400);
		const data = await response.json();
		expect(data.error).toBe("Not an organizer");
	});
});

/** A tournament the admin organizes, with teams registered and a write token to manage it with. */
async function organizedTournament(
	factories: Factories,
	{ teamCount = 1 }: { teamCount?: number } = {},
) {
	await factories.UserFactory.grant(ADMIN_ID, { roles: ["API_ACCESSER"] });

	const tournament = await factories.TournamentFactory.create({
		authorId: ADMIN_ID,
		startTimes: [dateToDatabaseTimestamp(addHours(new Date(), 2))],
	});

	const teams = [];
	for (let teamNth = 0; teamNth < teamCount; teamNth++) {
		const roster = await factories.UserFactory.createMany(ROSTER_SIZE);
		teams.push(
			await factories.TournamentTeamFactory.create({
				tournamentId: tournament.id,
				memberUserIds: roster.map((user) => user.id),
			}),
		);
	}

	const { token } = await factories.ApiTokenFactory.create({
		userId: ADMIN_ID,
		type: "write",
	});

	return {
		tournamentId: tournament.id,
		teamId: teams[0].id,
		memberUserIds: teams[0].memberUserIds,
		token,
	};
}

async function teamByName(
	page: Page,
	token: string,
	{ tournamentId, name }: { tournamentId: number; name: string },
) {
	const response = await page.request.fetch(
		`/api/tournament/${tournamentId}/teams`,
		{ headers: authorized(token) },
	);
	expect(response.status()).toBe(200);
	const teams = await response.json();

	return teams.find((team: { name: string }) => team.name === name);
}

async function readToken(factories: Factories, userId: number) {
	await factories.UserFactory.grant(userId, { roles: ["API_ACCESSER"] });

	const { token } = await factories.ApiTokenFactory.create({
		userId,
		type: "read",
	});

	return token;
}
