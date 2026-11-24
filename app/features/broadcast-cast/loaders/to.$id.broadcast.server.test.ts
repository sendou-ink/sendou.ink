import { beforeEach, describe, expect, test } from "vitest";
import * as TournamentBroadcastFactory from "~/db/seed/factories/TournamentBroadcastFactory";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { wrappedLoader } from "~/utils/Test";
import { loader } from "./to.$id.broadcast.server";

const broadcastLoader = wrappedLoader<Awaited<ReturnType<typeof loader>>>({
	loader,
});

const users = UserFactory.pool();
const organizerId = () => users.id(1);

const CAST_ACCOUNTS = [
	{ platform: "TWITCH" as const, account: "first", name: "first" },
	{ platform: "TWITCH" as const, account: "second", name: "second" },
];

beforeEach(async () => {
	await users.create(1);
});

describe("loader", () => {
	test("redirects to the first channel's dashboard", async () => {
		const { id } = await TournamentFactory.create(
			{ authorId: organizerId() },
			{ castAccounts: CAST_ACCOUNTS },
		);

		expect(await redirectLocation(id)).toBe(`/to/${id}/broadcast/first`);
	});

	test("redirects to the channel the user's OBS URL shows a broadcast of the tournament on", async () => {
		const { id } = await TournamentFactory.create(
			{ authorId: organizerId() },
			{ castAccounts: CAST_ACCOUNTS },
		);
		await TournamentBroadcastFactory.pointProgram({
			userId: organizerId(),
			tournamentId: id,
			channel: CAST_ACCOUNTS[1],
		});

		expect(await redirectLocation(id)).toBe(`/to/${id}/broadcast/second`);
	});

	test("renders the page without cast channels", async () => {
		const { id } = await TournamentFactory.create({ authorId: organizerId() });

		expect(
			await broadcastLoader({
				user: organizerId(),
				params: { id: String(id) },
			}),
		).toBeNull();
	});
});

async function redirectLocation(tournamentId: number) {
	try {
		await broadcastLoader({
			user: organizerId(),
			params: { id: String(tournamentId) },
		});
	} catch (error) {
		const response = (error as Error).cause;
		if (response instanceof Response) return response.headers.get("Location");
	}

	throw new Error("Expected a redirect");
}
