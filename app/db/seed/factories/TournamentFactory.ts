import type { TournamentSettings } from "~/db/tables-json";
import * as CalendarRepository from "~/features/calendar/CalendarRepository.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import { databaseTimestampNow } from "~/utils/dates";
import invariant from "~/utils/invariant";
import { defineFactory } from "../core/defineFactory";
import { faker } from "../core/faker";

const SINGLE_ELIMINATION: TournamentSettings["bracketProgression"] = [
	{
		name: "Bracket",
		type: "single_elimination",
		requiresCheckIn: false,
		settings: {
			thirdPlaceMatch: false,
		},
	},
];

/** The wrapping calendar event is not the caller's to choose, so it is not an argument. */
type InsertArgs = Omit<
	Parameters<typeof CalendarRepository.insert>[0],
	"isFullTournament"
>;

type Options = {
	/** Mark the tournament finished without recording any results. For cases that
	 * only need the flag; a tournament with real results is finalized by
	 * `TournamentRepository.finalize` with a summary. */
	isFinalized: boolean;
};

/**
 * Creates tournaments. Aggregate factory: the `CalendarEvent` wrapping the
 * tournament and its start date are created with it, because there is no such thing
 * as a tournament without one. Returns both ids.
 *
 * The bracket is a single elimination one unless `bracketProgression` says otherwise.
 */
export const { create } = defineFactory({
	defaults: () => ({
		name: faker.company.name(),
		description: null,
		discordInviteCode: null,
		bracketUrl: faker.internet.url(),
		organizationId: null,
		tags: null,
		badges: [],
		rules: null,
		startTimes: [databaseTimestampNow()],
		mapPickingStyle: "TO" as const,
		bracketProgression: SINGLE_ELIMINATION,
	}),
	insert: async (args: InsertArgs) => {
		const { eventId, tournamentId } = await CalendarRepository.insert({
			...args,
			isFullTournament: true,
		});

		invariant(tournamentId, "Expected the tournament to be created");

		return { id: tournamentId, eventId };
	},
	applyOptions: async (tournament, { isFinalized }: Options) => {
		if (!isFinalized) return;

		await TournamentRepository.finalizeWithoutSummary(tournament.id);
	},
});
