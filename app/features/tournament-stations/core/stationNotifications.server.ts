import { notify } from "~/features/notifications/core/notify.server";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import { tournamentSharedCached } from "~/features/tournament-bracket/core/Tournament.server";
import { IS_E2E_TEST_RUN } from "~/utils/e2e";
import { logger } from "~/utils/logger";
import * as TournamentStationRepository from "../TournamentStationRepository.server";
import * as StationNotifications from "./StationNotifications";

/**
 * How long a match has to stay on its station before its teams are notified.
 * @internal
 */
export const STATION_NOTIFICATION_DELAY_MS = IS_E2E_TEST_RUN ? 1_000 : 20_000;

const scheduledByTournamentId = new Map<
	number,
	StationNotifications.ScheduledNotice[]
>();
const timerByTournamentId = new Map<number, NodeJS.Timeout>();
const passByTournamentId = new Map<number, Promise<void>>();
const resumedTournamentIds = new Set<number>();

/**
 * Notifies the teams of the LAN tournament's matches that are playable on a station of it, see
 * {@link StationNotifications}: schedules the notices of matches newly on a station, drops the ones of matches
 * that moved since and sends the ones that stayed put for {@link STATION_NOTIFICATION_DELAY_MS}. Call after a
 * write that can make a match playable or change its station. Never throws.
 */
export function updateStationNotifications(tournament: Tournament) {
	const tournamentId = tournament.ctx.id;
	// one at a time per tournament so a notice is never sent twice
	const pass = (passByTournamentId.get(tournamentId) ?? Promise.resolve())
		.then(() => runPass(tournament))
		.catch((err) => logger.error("Failed to notify of match stations", err))
		.finally(() => {
			if (passByTournamentId.get(tournamentId) === pass) {
				passByTournamentId.delete(tournamentId);
			}
		});
	passByTournamentId.set(tournamentId, pass);

	return pass;
}

/**
 * Runs {@link updateStationNotifications} the first time the tournament is seen since the server started:
 * notices scheduled before a restart were only kept in memory.
 */
export function resumeStationNotifications(tournament: Tournament) {
	if (resumedTournamentIds.has(tournament.ctx.id)) return;

	resumedTournamentIds.add(tournament.ctx.id);
	void updateStationNotifications(tournament);
}

/** @internal */
export function clearStationNotificationsForTesting() {
	for (const timer of timerByTournamentId.values()) clearTimeout(timer);
	timerByTournamentId.clear();
	scheduledByTournamentId.clear();
	passByTournamentId.clear();
	resumedTournamentIds.clear();
}

async function runPass(tournament: Tournament) {
	const tournamentId = tournament.ctx.id;

	const { due, scheduled } = StationNotifications.schedule({
		current: StationNotifications.notices({
			tournament,
			placements:
				await TournamentStationRepository.findMatchPlacementsByTournamentId(
					tournamentId,
				),
			notifiedStations:
				await TournamentStationRepository.findNotifiedStationsByTournamentId(
					tournamentId,
				),
		}),
		scheduled: scheduledByTournamentId.get(tournamentId) ?? [],
		now: Date.now(),
		delayMs: STATION_NOTIFICATION_DELAY_MS,
	});

	if (due.length > 0) {
		const stations =
			await TournamentStationRepository.findAllByTournamentId(tournamentId);
		for (const notice of due) {
			const station = stations.find(({ id }) => id === notice.stationId);
			if (!station) continue;

			for (const args of StationNotifications.notifications({
				tournament,
				notice,
				station,
			})) {
				// a match moved back and forth sends the same "Moved to" again
				await notify({ ...args, allowRepeats: true });
			}
			await TournamentStationRepository.upsertNotifiedStation({
				matchId: notice.matchId,
				stationId: notice.stationId,
			});
		}
	}

	setScheduled(tournamentId, scheduled);
}

function setScheduled(
	tournamentId: number,
	scheduled: StationNotifications.ScheduledNotice[],
) {
	clearTimeout(timerByTournamentId.get(tournamentId));
	timerByTournamentId.delete(tournamentId);

	if (scheduled.length === 0) {
		scheduledByTournamentId.delete(tournamentId);
		return;
	}

	scheduledByTournamentId.set(tournamentId, scheduled);

	const nextDueAt = Math.min(...scheduled.map((notice) => notice.dueAt));
	const timer = setTimeout(
		() => {
			tournamentSharedCached(tournamentId)
				.then(updateStationNotifications)
				.catch((err) =>
					logger.error("Failed to notify of match stations", err),
				);
		},
		Math.max(0, nextDueAt - Date.now()),
	);
	timer.unref();
	timerByTournamentId.set(tournamentId, timer);
}
