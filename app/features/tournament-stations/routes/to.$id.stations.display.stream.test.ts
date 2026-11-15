import type { LoaderFunctionArgs } from "react-router";
import * as R from "remeda";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as EventBus from "~/features/events/core/EventBus.server";
import { tournamentChannel } from "~/features/tournament-bracket/tournament-bracket-utils";
import { withNoUser } from "~/utils/Test";
import {
	createFinalizedLanTournament,
	createStartedLanTournament,
} from "../tests/fixtures";
import { tournamentStationsChannel } from "../tournament-stations-utils";
import { loader } from "./to.$id.stations.display.stream";

const users = UserFactory.pool();
const openedStreams: Array<() => void> = [];

afterEach(() => {
	for (const abort of openedStreams) {
		abort();
	}
	openedStreams.length = 0;
});

describe("station display screen stream", () => {
	beforeEach(async () => {
		await users.create(17);
	});

	test("tells a logged out viewer the board changed when the stations change", async () => {
		const { tournamentId } = await createStartedLanTournament({
			authorId: users.id(1),
			teamRosters: R.chunk(users.ids().slice(1), 4),
		});
		const stream = await openStream(tournamentId);
		await vi.waitFor(() => {
			expect(
				EventBus.subscriberCount(tournamentStationsChannel(tournamentId)),
			).toBe(1);
		});

		EventBus.publish([tournamentStationsChannel(tournamentId)], {
			kind: "revalidate",
		});

		expect(await stream.nextChunk()).toBe('data: {"kind":"changed"}\n\n');
	});

	test("stops listening when the viewer goes away", async () => {
		const { tournamentId } = await createStartedLanTournament({
			authorId: users.id(1),
			teamRosters: R.chunk(users.ids().slice(1), 4),
		});
		const stream = await openStream(tournamentId);
		await vi.waitFor(() => {
			expect(
				EventBus.subscriberCount(tournamentStationsChannel(tournamentId)),
			).toBe(1);
		});

		stream.abort();

		await vi.waitFor(() => {
			expect(
				EventBus.subscriberCount(tournamentStationsChannel(tournamentId)),
			).toBe(0);
		});
	});

	test.each([
		{
			kind: "an online",
			create: async () =>
				(await TournamentFactory.create({ authorId: users.id(1) })).id,
		},
		{
			kind: "a finalized",
			create: async () =>
				(
					await createFinalizedLanTournament({
						authorId: users.id(1),
						teamRosters: R.chunk(users.ids().slice(1), 4),
					})
				).tournamentId,
		},
	])("404s for $kind tournament", async ({ create }) => {
		const tournamentId = await create();

		await expect(openStream(tournamentId)).rejects.toMatchObject({
			status: 404,
		});
		expect(EventBus.subscriberCount(tournamentChannel(tournamentId))).toBe(0);
	});
});

async function openStream(tournamentId: number) {
	const controller = new AbortController();
	const url = `http://app.com/to/${tournamentId}/stations/display/stream`;
	const request = new Request(url, { signal: controller.signal });
	const response = (await withNoUser(() =>
		loader({
			request,
			params: { id: String(tournamentId) },
			context: {} as any,
			pattern: "",
			url: new URL(url),
		} as LoaderFunctionArgs),
	)) as Response;
	openedStreams.push(() => controller.abort());

	const reader = response.body!.getReader();
	const decoder = new TextDecoder();

	return {
		nextChunk: async () => {
			const result = await reader.read();
			if (result.done) throw new Error("stream ended");

			return decoder.decode(result.value, { stream: true });
		},
		abort: () => controller.abort(),
	};
}
