import { beforeEach, describe, expect, test } from "vitest";
import * as LiveStreamFactory from "~/db/seed/factories/LiveStreamFactory";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentLFGTeamFactory from "~/db/seed/factories/TournamentLFGTeamFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { wrappedLoader } from "~/utils/Test";
import type { GetTournamentStreamsResponse } from "../schema";
import { loader } from "./tournament.$id.streams";

const users = UserFactory.pool();

const organizerId = () => users.id(1);
const streamerId = () => users.id(2);
const teammateId = () => users.id(3);

const streamsLoader = wrappedLoader<Response>({ loader });

const playerStreamUserIds = async (tournamentId: number) => {
	const response = await streamsLoader({
		params: { id: String(tournamentId) },
	});
	const streams = (await response.json()) as GetTournamentStreamsResponse;

	return streams.flatMap((stream) =>
		stream.type === "PLAYER" ? [stream.userId] : [],
	);
};

const createTournament = async () => {
	const { id } = await TournamentFactory.create({ authorId: organizerId() });

	return id;
};

describe("GET /api/tournament/:id/streams", () => {
	beforeEach(async () => {
		await users.create(3);
	});

	test("lists the stream of a member of a checked-in team", async () => {
		const tournamentId = await createTournament();
		await TournamentTeamFactory.create(
			{ tournamentId, memberUserIds: [streamerId(), teammateId()] },
			{ isCheckedIn: true },
		);
		await LiveStreamFactory.replaceAll([{ userId: streamerId() }]);

		expect(await playerStreamUserIds(tournamentId)).toEqual([streamerId()]);
	});

	test("lists no stream of a team that has not checked in", async () => {
		const tournamentId = await createTournament();
		await TournamentTeamFactory.create(
			{ tournamentId, memberUserIds: [streamerId(), teammateId()] },
			{ isCheckedIn: false },
		);
		await LiveStreamFactory.replaceAll([{ userId: streamerId() }]);

		expect(await playerStreamUserIds(tournamentId)).toEqual([]);
	});

	test("lists no stream of a solo player looking for a team", async () => {
		const tournamentId = await createTournament();
		await TournamentLFGTeamFactory.create({
			tournamentId,
			userId: streamerId(),
		});
		await LiveStreamFactory.replaceAll([{ userId: streamerId() }]);

		expect(await playerStreamUserIds(tournamentId)).toEqual([]);
	});

	test("responds 404 for a tournament that does not exist", async () => {
		await expect(streamsLoader({ params: { id: "999999" } })).rejects.toThrow(
			"404",
		);
	});
});
