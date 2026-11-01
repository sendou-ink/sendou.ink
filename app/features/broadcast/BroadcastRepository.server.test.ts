import { addDays } from "date-fns";
import { beforeEach, describe, expect, test } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as BroadcastRepository from "./BroadcastRepository.server";
import * as Producer from "./core/Producer";

const users = UserFactory.pool();

const channel = { platform: "TWITCH" as const, account: "sendouink" };

const createBroadcastKey = async () => {
	const { id: tournamentId } = await TournamentFactory.create({
		authorId: users.id(1),
	});

	return { tournamentId, channel };
};

describe("BroadcastRepository.updateNext", () => {
	beforeEach(async () => {
		await users.create(1);
	});

	test("creates the broadcast with only the patched field changed", async () => {
		const key = await createBroadcastKey();

		await BroadcastRepository.updateNext({
			...key,
			patch: { swapSides: true },
		});

		const broadcast = await BroadcastRepository.findByChannel(key);
		const initial = Producer.initialState();
		expect(broadcast?.state).toEqual({
			...initial,
			next: { ...initial.next, swapSides: true },
		});
	});

	test("keeps the fields set by earlier writes", async () => {
		const key = await createBroadcastKey();

		await BroadcastRepository.updateNext({
			...key,
			patch: { swapSides: true },
		});
		await BroadcastRepository.updateNext({
			...key,
			patch: { scene: "rosters" },
		});

		const broadcast = await BroadcastRepository.findByChannel(key);
		expect(broadcast?.state.next).toEqual({
			scene: "rosters",
			swapSides: true,
			transition: "stinger",
			ink: null,
		});
	});
});

describe("BroadcastRepository.updateSettings", () => {
	beforeEach(async () => {
		await users.create(1);
	});

	test("keeps the settings another form saved", async () => {
		const key = await createBroadcastKey();

		await BroadcastRepository.updateSettings({
			...key,
			patch: { css: "body { color: red; }", stinger: "burst" },
		});
		await BroadcastRepository.updateSettings({
			...key,
			patch: { headline: "Finals at 18:00", casterIds: [1, 2] },
		});

		const broadcast = await BroadcastRepository.findByChannel(key);
		expect(broadcast?.settings).toEqual({
			css: "body { color: red; }",
			stinger: "burst",
			headline: "Finals at 18:00",
			casterIds: [1, 2],
		});
	});
});

describe("BroadcastRepository.replaceState", () => {
	beforeEach(async () => {
		await users.create(1);
	});

	test("replaces the state based on the current take", async () => {
		const key = await createBroadcastKey();
		const taken = Producer.take(Producer.initialState(), null);

		const replaced = await BroadcastRepository.replaceState({
			...key,
			state: taken,
			expectedTakeId: 0,
		});

		expect(replaced).toBe(true);
		expect((await BroadcastRepository.findByChannel(key))?.state).toEqual(
			taken,
		);
	});

	test("rejects a state based on a stale take", async () => {
		const key = await createBroadcastKey();
		const firstTake = Producer.take(Producer.initialState(), null);
		await BroadcastRepository.replaceState({
			...key,
			state: firstTake,
			expectedTakeId: 0,
		});

		const replaced = await BroadcastRepository.replaceState({
			...key,
			state: Producer.take(Producer.initialState(), null),
			expectedTakeId: 0,
		});

		expect(replaced).toBe(false);
		expect((await BroadcastRepository.findByChannel(key))?.state).toEqual(
			firstTake,
		);
	});
});

describe("BroadcastRepository.updateLiveResults", () => {
	beforeEach(async () => {
		await users.create(1);
	});

	test("sets only the live results", async () => {
		const key = await createBroadcastKey();
		await BroadcastRepository.updateNext({
			...key,
			patch: { swapSides: true },
		});

		await BroadcastRepository.updateLiveResults({
			...key,
			liveResults: { matchId: 5, count: 2 },
		});

		const broadcast = await BroadcastRepository.findByChannel(key);
		expect(broadcast?.state.liveResults).toEqual({ matchId: 5, count: 2 });
		expect(broadcast?.state.next.swapSides).toBe(true);
	});
});

describe("BroadcastRepository.insertChatRoomIfMissing", () => {
	beforeEach(async () => {
		await users.create(1);
	});

	const expiresAt = addDays(new Date(), 7);

	test("creates the room once per channel", async () => {
		const key = await createBroadcastKey();

		const first = await BroadcastRepository.insertChatRoomIfMissing({
			...key,
			expiresAt,
		});
		const second = await BroadcastRepository.insertChatRoomIfMissing({
			...key,
			expiresAt,
		});

		expect(first.isCreated).toBe(true);
		expect(second).toEqual({ chatRoomId: first.chatRoomId, isCreated: false });
	});

	test("gives a room to a broadcast created by earlier writes, keeping its state", async () => {
		const key = await createBroadcastKey();
		await BroadcastRepository.updateNext({
			...key,
			patch: { swapSides: true },
		});

		const { chatRoomId, isCreated } =
			await BroadcastRepository.insertChatRoomIfMissing({ ...key, expiresAt });

		expect(isCreated).toBe(true);
		const [owner] = await BroadcastRepository.findAllByChatRoomIds([
			chatRoomId,
		]);
		expect(owner?.account).toBe(channel.account);
		expect(
			(await BroadcastRepository.findByChannel(key))?.state.next.swapSides,
		).toBe(true);
	});
});
