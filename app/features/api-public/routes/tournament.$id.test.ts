import { beforeEach, describe, expect, test } from "bun:test";
import * as ImageFactory from "~/db/seed/factories/ImageFactory";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { wrappedLoader } from "~/utils/Test";
import type { GetTournamentResponse } from "../schema";
import { loader } from "./tournament.$id";

const LOGO_FILE_NAME = "tournament-logo-abc-123.webp";

const users = UserFactory.pool();
const organizerId = () => users.id(1);

const tournamentLoader = wrappedLoader<Response>({ loader });

const fetchTournament = async (tournamentId: number) => {
	const response = await tournamentLoader({
		user: organizerId(),
		params: { id: String(tournamentId) },
	});

	return (await response.json()) as GetTournamentResponse;
};

describe("GET /api/tournament/:id", () => {
	beforeEach(async () => {
		await users.create(1);
	});

	test("returns the logo as a full URL", async () => {
		const logo = await ImageFactory.create(
			{ url: LOGO_FILE_NAME, submitterUserId: organizerId() },
			{ isValidated: true },
		);
		const tournament = await TournamentFactory.create({
			authorId: organizerId(),
			avatarImgId: logo.id,
		});

		const { logoUrl } = await fetchTournament(tournament.id);

		expect(logoUrl).toMatch(/^https?:\/\/.+\/tournament-logo-abc-123\.webp$/);
	});

	test("returns how teams progress between brackets", async () => {
		const tournament = await TournamentFactory.create({
			authorId: organizerId(),
			bracketProgression: [
				{
					type: "round_robin",
					name: "Groups",
					requiresCheckIn: false,
					settings: {},
				},
				{
					type: "single_elimination",
					name: "Top Cut",
					requiresCheckIn: true,
					settings: {},
					sources: [{ bracketIdx: 0, placements: [1, 2] }],
				},
				{
					type: "single_elimination",
					name: "Redemption",
					requiresCheckIn: false,
					settings: {},
					sources: [{ bracketIdx: 0, placements: [3], rest: true }],
				},
			],
		});

		const { brackets } = await fetchTournament(tournament.id);

		expect(brackets).toEqual([
			{ name: "Groups", type: "round_robin", requiresCheckIn: false },
			{
				name: "Top Cut",
				type: "single_elimination",
				requiresCheckIn: true,
				sources: [{ bracketIdx: 0, placements: [1, 2] }],
			},
			{
				name: "Redemption",
				type: "single_elimination",
				requiresCheckIn: false,
				sources: [{ bracketIdx: 0, placements: [3], rest: true }],
			},
		]);
	});
});
