import { sub } from "date-fns";
import { beforeEach, describe, expect, test } from "vitest";
import * as LiveStreamFactory from "~/db/seed/factories/LiveStreamFactory";
import * as SQMatchFactory from "~/db/seed/factories/SQMatchFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { FULL_GROUP_SIZE } from "~/features/sendouq/q-constants";
import * as QStreamsRepository from "./QStreamsRepository.server";

const TWITCH_ACCOUNT = "streamer";
const OTHER_TWITCH_ACCOUNT = "someone_else";

const users = UserFactory.pool();

/** The account the streamer plays their matches on. */
const streamerId = () => users.id(1);
/** An abandoned account of the streamer, linked to the same Twitch account. */
const duplicateStreamerId = () => users.id(FULL_GROUP_SIZE * 2 + 1);
/** Streams, but plays no match. */
const outsiderId = () => users.id(FULL_GROUP_SIZE * 2 + 2);

const alphaUserIds = () => users.ids().slice(0, FULL_GROUP_SIZE);
const bravoUserIds = () =>
	users.ids().slice(FULL_GROUP_SIZE, FULL_GROUP_SIZE * 2);

const twitchAccountOf = (index: number) => {
	if (index === 0 || index === FULL_GROUP_SIZE * 2) return TWITCH_ACCOUNT;
	if (index === FULL_GROUP_SIZE * 2 + 1) return OTHER_TWITCH_ACCOUNT;
	return null;
};

const createMatch = (options: { createdAt?: Date } = {}) =>
	SQMatchFactory.create(
		{ alphaUserIds: alphaUserIds(), bravoUserIds: bravoUserIds() },
		options,
	);

describe("QStreamsRepository.findAllActiveMatchPlayers", () => {
	beforeEach(async () => {
		await users.create(FULL_GROUP_SIZE * 2 + 2, (index) => ({
			twitch: twitchAccountOf(index),
		}));
	});

	test("returns the stream of a player of an active match", async () => {
		await createMatch();
		await LiveStreamFactory.replaceAll([
			{ userId: streamerId(), twitch: TWITCH_ACCOUNT },
		]);

		const players = await QStreamsRepository.findAllActiveMatchPlayers();

		expect(players).toHaveLength(1);
		expect(players[0].user.id).toBe(streamerId());
		expect(players[0].streamTwitch).toBe(TWITCH_ACCOUNT);
	});

	test("returns the stream credited to another user sharing the twitch account", async () => {
		await createMatch();
		await LiveStreamFactory.replaceAll([
			{ userId: duplicateStreamerId(), twitch: TWITCH_ACCOUNT },
		]);

		const players = await QStreamsRepository.findAllActiveMatchPlayers();

		expect(players).toHaveLength(1);
		expect(players[0].user.id).toBe(streamerId());
	});

	test("returns no stream of a user playing no match", async () => {
		await createMatch();
		await LiveStreamFactory.replaceAll([
			{ userId: outsiderId(), twitch: OTHER_TWITCH_ACCOUNT },
		]);

		expect(await QStreamsRepository.findAllActiveMatchPlayers()).toHaveLength(
			0,
		);
	});

	test("returns no stream of a match older than an hour", async () => {
		await createMatch({ createdAt: sub(new Date(), { hours: 2 }) });
		await LiveStreamFactory.replaceAll([
			{ userId: streamerId(), twitch: TWITCH_ACCOUNT },
		]);

		expect(await QStreamsRepository.findAllActiveMatchPlayers()).toHaveLength(
			0,
		);
	});
});
