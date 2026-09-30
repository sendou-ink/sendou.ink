import { beforeEach, describe, expect, test } from "vitest";
import * as LiveStreamFactory from "~/db/seed/factories/LiveStreamFactory";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as TournamentRepository from "./TournamentRepository.server";

const TWITCH_ACCOUNT = "streamer";
const OTHER_TWITCH_ACCOUNT = "someone_else";

const users = UserFactory.pool();

/** The account the streamer plays the tournament on. */
const streamerId = () => users.id(1);
/** An abandoned account of the streamer, linked to the same Twitch account. */
const duplicateStreamerId = () => users.id(2);
/** Streams, but plays no tournament. */
const outsiderId = () => users.id(3);
const teammateId = () => users.id(4);
const otherTeammateId = () => users.id(5);

const TWITCH_ACCOUNTS: Array<string | null> = [
	TWITCH_ACCOUNT,
	TWITCH_ACCOUNT,
	OTHER_TWITCH_ACCOUNT,
	null,
	null,
];

const createTournament = () =>
	TournamentFactory.create({ authorId: teammateId() });

const createTeam = (
	tournamentId: number,
	memberUserIds: number[],
	{ isCheckedIn = true } = {},
) =>
	TournamentTeamFactory.create(
		{ tournamentId, memberUserIds },
		{ isCheckedIn },
	);

const participantStreamsOf = async (tournamentId: number) => {
	const { participantStreams } =
		await TournamentRepository.findStreamsByTournamentId(tournamentId);

	return participantStreams;
};

describe("TournamentRepository.findStreamsByTournamentId", () => {
	beforeEach(async () => {
		await users.create(TWITCH_ACCOUNTS.length, (index) => ({
			twitch: TWITCH_ACCOUNTS[index],
		}));
	});

	test("returns the stream of a checked in participant", async () => {
		const { id: tournamentId } = await createTournament();
		await createTeam(tournamentId, [streamerId(), teammateId()]);
		await LiveStreamFactory.replaceAll([
			{ userId: streamerId(), twitch: TWITCH_ACCOUNT },
		]);

		const streams = await participantStreamsOf(tournamentId);

		expect(streams).toHaveLength(1);
		expect(streams[0].userId).toBe(streamerId());
		expect(streams[0].twitch).toBe(TWITCH_ACCOUNT);
	});

	test("returns the stream credited to another user sharing the twitch account", async () => {
		const { id: tournamentId } = await createTournament();
		await createTeam(tournamentId, [streamerId(), teammateId()]);
		await LiveStreamFactory.replaceAll([
			{ userId: duplicateStreamerId(), twitch: TWITCH_ACCOUNT },
		]);

		const streams = await participantStreamsOf(tournamentId);

		expect(streams).toHaveLength(1);
		expect(streams[0].userId).toBe(streamerId());
	});

	test("returns one stream when both users sharing the twitch account play the tournament", async () => {
		const { id: tournamentId } = await createTournament();
		await createTeam(tournamentId, [streamerId(), teammateId()]);
		await createTeam(tournamentId, [duplicateStreamerId(), otherTeammateId()]);
		await LiveStreamFactory.replaceAll([
			{ userId: duplicateStreamerId(), twitch: TWITCH_ACCOUNT },
		]);

		const streams = await participantStreamsOf(tournamentId);

		expect(streams).toHaveLength(1);
	});

	test("returns no stream of a team that has not checked in", async () => {
		const { id: tournamentId } = await createTournament();
		await createTeam(tournamentId, [streamerId(), teammateId()], {
			isCheckedIn: false,
		});
		await LiveStreamFactory.replaceAll([
			{ userId: streamerId(), twitch: TWITCH_ACCOUNT },
		]);

		expect(await participantStreamsOf(tournamentId)).toHaveLength(0);
	});

	test("returns no stream of a user not playing the tournament", async () => {
		const { id: tournamentId } = await createTournament();
		await createTeam(tournamentId, [streamerId(), teammateId()]);
		await LiveStreamFactory.replaceAll([
			{ userId: outsiderId(), twitch: OTHER_TWITCH_ACCOUNT },
		]);

		expect(await participantStreamsOf(tournamentId)).toHaveLength(0);
	});
});
