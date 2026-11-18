import { addDays } from "date-fns";
import { beforeEach, describe, expect, test } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentOrganizationFactory from "~/db/seed/factories/TournamentOrganizationFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { CAST_PRODUCER_RULES } from "~/features/broadcast-cast/broadcast-cast-constants";
import type { CastBroadcastSettings } from "~/features/broadcast-cast/broadcast-cast-types";
import * as BroadcastRepository from "./BroadcastRepository.server";
import { DEFAULT_BROADCAST_SETTINGS } from "./broadcast-constants";
import * as Producer from "./core/Producer";

const rules = CAST_PRODUCER_RULES;

const users = UserFactory.pool();

const channel = { platform: "TWITCH" as const, account: "sendouink" };
const OTHER_CHANNEL = { platform: "TWITCH" as const, account: "sendouink2" };

const createBroadcastKey = async ({
	organizationId = null,
}: {
	organizationId?: number | null;
} = {}) => {
	const { id: tournamentId } = await TournamentFactory.create({
		authorId: users.id(1),
		organizationId,
	});

	return { tournamentId, channel, rules };
};

describe("BroadcastRepository.updateProducer", () => {
	beforeEach(async () => {
		await users.create(1);
	});

	test("creates the broadcast with the changed state", async () => {
		const key = await createBroadcastKey();
		const initial = Producer.initialState(rules);

		const isUpdated = await BroadcastRepository.updateProducer({
			...key,
			change: (state) =>
				Producer.editItem(rules, state, state.next.id, { swapSides: true }),
		});

		expect(isUpdated).toBe(true);
		expect((await BroadcastRepository.findByChannel(key))?.state).toEqual({
			...initial,
			next: { ...initial.next, swapSides: true },
		});
	});

	test("changes the state as earlier writes left it", async () => {
		const key = await createBroadcastKey();
		await BroadcastRepository.updateProducer({
			...key,
			change: (state) => Producer.enqueue(rules, state, { hasMatch: true }),
		});

		await BroadcastRepository.updateProducer({
			...key,
			change: (state) => Producer.enqueue(rules, state, { hasMatch: true }),
		});

		const broadcast = await BroadcastRepository.findByChannel(key);
		expect(broadcast?.state.queue.map((item) => item.id)).toEqual([3, 4]);
	});

	test("leaves the state as it is when nothing changes", async () => {
		const key = await createBroadcastKey();
		await BroadcastRepository.updateProducer({
			...key,
			change: (state) => Producer.enqueue(rules, state, { hasMatch: true }),
		});

		const isUpdated = await BroadcastRepository.updateProducer({
			...key,
			change: () => null,
		});

		expect(isUpdated).toBe(false);
		expect(
			(await BroadcastRepository.findByChannel(key))?.state.queue,
		).toHaveLength(1);
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
			patch: { css: "body { color: red; }", weaponImages: "outlined" },
		});
		await BroadcastRepository.updateSettings<CastBroadcastSettings>({
			...key,
			patch: {
				headline: "Finals at 18:00",
				casters: [
					{ userId: 1, vdoNinjaUrl: null, isAudioOnly: false, volume: 100 },
				],
			},
		});

		const broadcast = await BroadcastRepository.findByChannel(key);
		expect(broadcast?.settings).toEqual({
			css: "body { color: red; }",
			weaponImages: "outlined",
			headline: "Finals at 18:00",
			casters: [
				{ userId: 1, vdoNinjaUrl: null, isAudioOnly: false, volume: 100 },
			],
		});
	});
});

describe("BroadcastRepository new broadcast settings", () => {
	const THEME = {
		css: "body { color: red; }",
		weaponImages: "outlined",
	} as const;

	beforeEach(async () => {
		await users.create(1);
	});

	test("carry over from the channel's latest broadcast in the organization", async () => {
		const organizationId = await createOrganization();
		const first = await createBroadcastKey({ organizationId });
		await BroadcastRepository.updateSettings({ ...first, patch: THEME });
		const latest = await createBroadcastKey({ organizationId });
		await BroadcastRepository.updateSettings({
			...latest,
			patch: { css: "body { color: blue; }" },
		});

		const next = await createBroadcastKey({ organizationId });
		await BroadcastRepository.insertChatRoomIfMissing({
			...next,
			expiresAt: addDays(new Date(), 7),
		});

		expect((await BroadcastRepository.findByChannel(next))?.settings).toEqual({
			...THEME,
			css: "body { color: blue; }",
		});
	});

	test.each([
		{
			why: "another organization's broadcast",
			earlier: async () => ({
				organizationId: await createOrganization(),
				channel,
			}),
		},
		{
			why: "a broadcast without an organization",
			earlier: async () => ({ organizationId: null, channel }),
		},
		{
			why: "another channel's broadcast in the organization",
			earlier: async (organizationId: number) => ({
				organizationId,
				channel: OTHER_CHANNEL,
			}),
		},
	])("start from the defaults after $why", async ({ earlier }) => {
		const organizationId = await createOrganization();
		const earlierBroadcast = await earlier(organizationId);
		const other = await createBroadcastKey({
			organizationId: earlierBroadcast.organizationId,
		});
		await BroadcastRepository.updateSettings({
			...other,
			channel: earlierBroadcast.channel,
			patch: THEME,
		});

		const key = await createBroadcastKey({ organizationId });
		await BroadcastRepository.insertChatRoomIfMissing({
			...key,
			expiresAt: addDays(new Date(), 7),
		});

		expect((await BroadcastRepository.findByChannel(key))?.settings).toEqual(
			DEFAULT_BROADCAST_SETTINGS,
		);
	});

	async function createOrganization() {
		const { id } = await TournamentOrganizationFactory.create({
			ownerId: users.id(1),
		});

		return id;
	}
});

describe("BroadcastRepository.updateState", () => {
	beforeEach(async () => {
		await users.create(1);
	});

	test("sets only the given fields", async () => {
		const key = await createBroadcastKey();
		const ink = {
			key: "lockYellowPurple",
			isFlipped: true,
			matchId: 5,
			resultCount: 2,
		} as const;
		await swapSidesOfNext(key);
		await BroadcastRepository.updateState({ ...key, patch: { ink } });

		await BroadcastRepository.updateState({
			...key,
			patch: { liveResults: { matchId: 5, count: 2 } },
		});

		const broadcast = await BroadcastRepository.findByChannel(key);
		expect(broadcast?.state.liveResults).toEqual({ matchId: 5, count: 2 });
		expect(broadcast?.state.ink).toEqual(ink);
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
		await swapSidesOfNext(key);

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

function swapSidesOfNext(key: Awaited<ReturnType<typeof createBroadcastKey>>) {
	return BroadcastRepository.updateProducer({
		...key,
		change: (state) =>
			Producer.editItem(rules, state, state.next.id, { swapSides: true }),
	});
}
