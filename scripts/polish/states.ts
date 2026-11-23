/**
 * Pages in the states a seed never leaves them in: a SendouQ match waiting on a report, a tournament of every
 * format before, during and after its bracket, a lobby you are waitlisted in, a brand new user. Built with the
 * dev tools' scenarios (`~/features/dev-tools/core/Scenarios.server`) out of fresh users, so the content is
 * everyday content. Runs after the content stress rows and returns the pages to visit, see `build-db.ts`.
 */
import * as Scenarios from "~/features/dev-tools/core/Scenarios.server";
import { invariant } from "~/utils/invariant";
import { withoutInfoLogs } from "~/utils/logger";
import type { StressTarget } from "./stress";

/** Every scenario worth a look, with the parameters that change what the page shows. */
const STATES: Array<{
	scenario: string;
	params?: Record<string, string | number>;
}> = [
	{ scenario: "sendouq-looking", params: { groupSize: "1" } },
	{ scenario: "sendouq-looking", params: { groupSize: "4" } },
	{ scenario: "sendouq-match", params: { state: "started" } },
	{ scenario: "sendouq-match", params: { state: "opponent-reported" } },
	{ scenario: "sendouq-match", params: { state: "cancel-requested" } },
	{ scenario: "sendouq-match", params: { state: "concluded" } },
	{
		scenario: "tournament-organizer",
		params: { format: "single_elimination", progress: "registration" },
	},
	{
		scenario: "tournament-organizer",
		params: { format: "double_elimination", progress: "started" },
	},
	{
		scenario: "tournament-organizer",
		params: { format: "round_robin", progress: "first-round-played" },
	},
	{
		scenario: "tournament-organizer",
		params: { format: "swiss", progress: "first-round-played" },
	},
	{
		scenario: "tournament-organizer",
		params: { format: "swiss", progress: "finished" },
	},
	{
		scenario: "tournament-organizer",
		params: { format: "single_elimination", progress: "finished", teams: 16 },
	},
	{ scenario: "tournament-player", params: { format: "double_elimination" } },
	{ scenario: "tournament-registration" },
	{ scenario: "tournament-lfg-solo" },
	{ scenario: "tournament-lfg-team", params: { you: "owner" } },
	{ scenario: "tournament-lfg-subs", params: { you: "captain" } },
	{ scenario: "scrim", params: { state: "request-pending" } },
	{ scenario: "scrim", params: { state: "scheduled" } },
	{ scenario: "lobby-sign-up", params: { you: "not-signed-up" } },
	{ scenario: "lobby-sign-up", params: { you: "waitlisted" } },
	{ scenario: "lobby-sign-up", params: { you: "host" } },
	{ scenario: "lobby-applications", params: { you: "applied" } },
	{ scenario: "lobby-applications", params: { you: "host" } },
	{ scenario: "lobby-set", params: { state: "reporting" } },
	{ scenario: "lobby-set", params: { state: "disputed" } },
	{ scenario: "lobby-open-spot" },
	{ scenario: "lobbies-index" },
	{ scenario: "new-user" },
	{ scenario: "veteran-user" },
	{ scenario: "team-owner" },
	{ scenario: "banned-user" },
	{ scenario: "plus-voting" },
	{
		scenario: "tournament-broadcast",
		params: { format: "double_elimination", roundsPlayed: 1, teams: 16 },
	},
	{
		scenario: "tournament-broadcast",
		params: { format: "swiss", role: "streamer" },
	},
	{
		scenario: "tournament-broadcast",
		params: { format: "round_robin", roundsPlayed: 1 },
	},
	{
		scenario: "tournament-broadcast",
		params: { format: "single_elimination" },
	},
	{ scenario: "tournament-broadcast-design" },
];

/** Builds every state of `STATES` and resolves to the pages showing them, each with the user to view it as. */
export async function seedStates(): Promise<StressTarget[]> {
	return withoutInfoLogs(buildStates);
}

async function buildStates() {
	const targets: StressTarget[] = [];

	for (const { scenario, params = {} } of STATES) {
		const outcome = await Scenarios.run(scenario, params);
		invariant(
			outcome.status === "ok",
			`Scenario ${scenario} did not run: ${outcome.status}${"message" in outcome ? ` (${outcome.message})` : ""}`,
		);

		const settings = Object.entries(params)
			.map(([key, value]) => `${key} ${value}`)
			.join(", ");
		const label = `state: ${scenario}${settings ? ` (${settings})` : ""}`;
		const { path, userId, links = [] } = outcome.result;
		targets.push({ url: path, label, viewerId: userId, kind: "state" });
		for (const link of links) {
			targets.push({
				url: link.path,
				label: `${label}, ${link.label}`,
				viewerId: userId,
				kind: "state",
			});
		}
	}

	return targets;
}
