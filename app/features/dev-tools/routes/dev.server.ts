import path from "node:path";
import type { LoaderFunctionArgs } from "react-router";
import { ServerConfig } from "~/config.server";
import { refreshCaches } from "~/features/api-private/core/refresh-caches.server";
import * as Seasons from "~/features/mmr/core/Seasons";
import { runWithoutWebPush } from "~/features/notifications/core/push-suppression.server";
import { webPushEnabled } from "~/features/notifications/core/webPush.server";
import {
	DANGEROUS_setVotingActiveOverride,
	isVotingActiveOverridden,
} from "~/features/plus-voting/core/voting-time";
import { defineAction } from "~/form/define-action.server";
import {
	daily,
	everyHourAt00,
	everyHourAt30,
	everyTwoMinutes,
	weekly,
} from "~/routines/list.server";
import { assertUnreachable } from "~/utils/types";
import { RESEEDABLE_DATABASE_FILE } from "../dev-tools-constants";
import { devServerActionSchema } from "../dev-tools-schemas";
import { requireDevTools } from "../dev-tools-utils.server";

const ROUTINE_SCHEDULES = [
	{ schedule: "Every 2 minutes", routines: everyTwoMinutes },
	{ schedule: "Hourly at :00", routines: everyHourAt00 },
	{ schedule: "Hourly at :30", routines: everyHourAt30 },
	{ schedule: "Daily", routines: daily },
	{ schedule: "Weekly", routines: weekly },
];

export type DevServerLoaderData = ReturnType<typeof loader>;
export type DevServerActionData = Exclude<
	Awaited<ReturnType<typeof action>>,
	{ fieldErrors: unknown }
>;

export const loader = ({ request }: LoaderFunctionArgs) => {
	requireDevTools(request);

	return {
		database: {
			file: path.basename(ServerConfig.dbPath),
			isReseedable: isReseedable(),
		},
		webPushEnabled,
		switches: {
			seasonEnded: Seasons.isSeasonEndedOverridden(),
			plusVotingActive: isVotingActiveOverridden(),
		},
		routineSchedules: ROUTINE_SCHEDULES.map(({ schedule, routines }) => ({
			schedule,
			names: routines.map((routine) => routine.name),
		})),
	};
};

export const action = defineAction(
	{ body: devServerActionSchema, onInvalidBody: "badRequest" },
	async ({ request, body }) => {
		requireDevTools(request);

		switch (body._action) {
			case "SET_SWITCH": {
				if (body.switch === "seasonEnded") {
					Seasons.DANGEROUS_setSeasonEndedOverride(body.value);
				} else {
					DANGEROUS_setVotingActiveOverride(body.value);
				}
				// cached SendouQ & leaderboard data was computed for the other value
				await refreshCaches();

				return { ok: true, durationMs: null };
			}
			case "REFRESH_CACHES": {
				return timed(refreshCaches);
			}
			case "RESEED": {
				if (!isReseedable()) {
					throw Response.json(
						{
							error: `Reseeding is only allowed on ${RESEEDABLE_DATABASE_FILE}`,
						},
						{ status: 400 },
					);
				}

				return timed(async () => {
					const { seed } = await import("~/db/seed");
					await runWithoutWebPush(seed);
					await refreshCaches();
				});
			}
			case "RUN_ROUTINE": {
				const routine = ROUTINE_SCHEDULES.flatMap(
					(schedule) => schedule.routines,
				).find((candidate) => candidate.name === body.name);
				if (!routine) {
					throw Response.json(
						{ error: `Unknown routine ${body.name}` },
						{ status: 400 },
					);
				}

				const startedAt = performance.now();
				const ok = await runWithoutWebPush(() => routine.run());

				return { ok, durationMs: performance.now() - startedAt };
			}
			default:
				assertUnreachable(body);
		}
	},
);

function isReseedable() {
	return (
		path.resolve(ServerConfig.dbPath) === path.resolve(RESEEDABLE_DATABASE_FILE)
	);
}

async function timed(fn: () => Promise<void>) {
	const startedAt = performance.now();
	await fn();

	return { ok: true, durationMs: performance.now() - startedAt };
}
