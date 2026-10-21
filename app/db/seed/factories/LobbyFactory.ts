import { addHours } from "date-fns";
import * as LobbySet from "~/features/lobbies/core/LobbySet";
import type * as LobbyMatchRepositoryModule from "~/features/lobbies/LobbyMatchRepository.server";
import * as LobbyRepository from "~/features/lobbies/LobbyRepository.server";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { actAs } from "../core/actAs";
import { defineFactory } from "../core/defineFactory";

type InsertArgs = Parameters<typeof LobbyRepository.insert>[0];

type Options = {
	/** Sign up after the host, in order, within the room size if there's room */
	signedUpUserIds?: number[];
	/** Of the signed up (host included), who has checked in */
	checkedInUserIds?: number[];
	/** Sign up once the lobby has started, waiting for a spot in the room. Needs a start in the past. Not for e2e. */
	lateWaitlistedUserIds?: number[];
	/** Sets played out and confirmed after the lobby starts, alpha winning every map. Needs a start in the past. Not for e2e. */
	playedSetCount?: number;
	/** Maps reported in the set after the played ones */
	reportedMapCount?: number;
	isEnded?: boolean;
};

/** `hostUserId` makes the lobby and is its first participant. Starts in an hour, public, by default. */
export const { create } = defineFactory({
	defaults: ({ seq }) => ({
		name: `Lobby ${seq}`,
		label: "CASUAL" as const,
		startsAt: dateToDatabaseTimestamp(addHours(new Date(), 1)),
		bestOf: 3 as const,
		modes: ["SZ", "TC", "RM", "CB"] satisfies InsertArgs["modes"],
		roomSize: 8 as const,
		visibility: null,
	}),
	insert: async (args: InsertArgs) => ({
		id: await LobbyRepository.insert(args),
		roomSize: args.roomSize,
	}),
	applyOptions: async (
		lobby,
		{
			signedUpUserIds,
			checkedInUserIds,
			lateWaitlistedUserIds = [],
			playedSetCount = 0,
			reportedMapCount = 0,
			isEnded,
		}: Options,
	) => {
		for (const [i, userId] of (signedUpUserIds ?? []).entries()) {
			await LobbyRepository.insertParticipant({
				lobbyId: lobby.id,
				userId,
				// the host is the first participant
				status: i + 1 < lobby.roomSize ? "REGISTERED" : "WAITLISTED",
			});
		}

		for (const userId of checkedInUserIds ?? []) {
			await LobbyRepository.updateParticipant({
				lobbyId: lobby.id,
				userId,
				status: "CHECKED_IN",
			});
		}

		if (
			playedSetCount === 0 &&
			reportedMapCount === 0 &&
			lateWaitlistedUserIds.length === 0
		) {
			if (isEnded) await LobbyRepository.end(lobby.id);
			return;
		}

		// imported only here: the e2e process can't load what notifications pull in (locale JSON)
		const LobbyProgression = await import(
			"~/features/lobbies/core/LobbyProgression.server"
		);
		const LobbyMatchRepository = await import(
			"~/features/lobbies/LobbyMatchRepository.server"
		);

		await LobbyProgression.advance(lobby.id);

		for (const userId of lateWaitlistedUserIds) {
			await LobbyRepository.insertParticipant({
				lobbyId: lobby.id,
				userId,
				status: "WAITLISTED",
			});
		}

		for (let i = 0; i < playedSetCount; i++) {
			for (const set of await unfinishedSets(LobbyMatchRepository, lobby.id)) {
				await reportMaps(LobbyMatchRepository, set, Math.ceil(set.bestOf / 2));
				await actAs(LobbySet.playersOf(set, "BRAVO")[0], () =>
					LobbyMatchRepository.confirmSet(set.id),
				);
			}
			await LobbyProgression.advance(lobby.id);
		}

		for (const set of await unfinishedSets(LobbyMatchRepository, lobby.id)) {
			await reportMaps(LobbyMatchRepository, set, reportedMapCount);
		}

		if (isEnded) await LobbyRepository.end(lobby.id);
	},
});

async function unfinishedSets(
	LobbyMatchRepository: typeof LobbyMatchRepositoryModule,
	lobbyId: number,
) {
	const sets = await LobbyMatchRepository.findAllSetsByLobbyId(lobbyId);

	return sets.filter((set) => !LobbySet.isFinished(set));
}

async function reportMaps(
	LobbyMatchRepository: typeof LobbyMatchRepositoryModule,
	set: Awaited<ReturnType<typeof unfinishedSets>>[number],
	count: number,
) {
	const reporterId = LobbySet.playersOf(set, "ALPHA")[0];

	for (let i = 0; i < count; i++) {
		await actAs(reporterId, () =>
			LobbyMatchRepository.reportGame({
				setId: set.id,
				winnerSide: "ALPHA",
				reportedCount: i,
			}),
		);
	}
}
