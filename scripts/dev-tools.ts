// Command line client of the dev toolbar's API, talks to a running dev server.
// Usage: pnpm run dev:tools <command> (run without a command for help)

import { parseArgs } from "node:util";
import { mapValues } from "remeda";
import type { DevRequestsLoaderData } from "~/features/dev-tools/routes/dev.requests";
import type { DevRequestLoaderData } from "~/features/dev-tools/routes/dev.requests.$id";
import type {
	DevScenarioActionData,
	DevScenariosLoaderData,
} from "~/features/dev-tools/routes/dev.scenarios";
import type {
	DevServerActionData,
	DevServerLoaderData,
} from "~/features/dev-tools/routes/dev.server";

const HELP = `Usage: pnpm run dev:tools <command> [--url=http://localhost:5173]

Commands:
  scenarios                   List the scenarios and their parameters
  scenario <id> [--key=value] Run a scenario, prints the link that logs in as its user
                              e.g. scenario tournament-organizer --teams=16 --format=swiss
  requests [count]            Latest requests with their query counts (default 20)
  request <id>                Every query of one request
  log-in-as <userId> [path]   Link that logs in as the user ("me" = stop impersonating)
  server                      Database, switches and routines of the dev server
  switch <name> <on|off>      Flip a switch (seasonEnded, plusVotingActive)
  routine <name>              Run a routine now, web push off
  refresh-caches              Clear the server's in-process caches

The server is found from --url, the DEV_SERVER_URL env var or PORT (default 5173).`;

const {
	values: { url: urlFlag, ...flagValues },
	positionals: [command, ...rest],
} = parseArgs({
	options: { url: { type: "string" } },
	strict: false,
	allowPositionals: true,
});
// a bare `--key` means the param's default, like `--key=`
const flags = mapValues(flagValues, (value) =>
	typeof value === "string" ? value : "",
);

const baseUrl = (
	(typeof urlFlag === "string" ? urlFlag : undefined) ??
	process.env.DEV_SERVER_URL ??
	`http://localhost:${process.env.PORT ?? 5173}`
).replace(/\/$/, "");

switch (command) {
	case "scenarios": {
		const { scenarios } = await get<DevScenariosLoaderData>("/dev/scenarios");
		for (const scenario of scenarios) {
			log(`${scenario.id.padEnd(26)} ${scenario.title}`);
			log(`${"".padEnd(26)} ${scenario.description}`);
			for (const param of scenario.params) {
				const values =
					param.kind === "select"
						? param.options.map((option) => option.value).join(" | ")
						: `${param.min}-${param.max}`;
				log(
					`${"".padEnd(28)}--${param.key}=${values} (default ${param.default})`,
				);
			}
		}
		break;
	}
	case "scenario": {
		const [scenarioId] = rest;
		if (!scenarioId) exitWithHelp();

		const result = await post<DevScenarioActionData>("/dev/scenarios", {
			scenarioId,
			params: flags,
		});
		log(`User: ${result.userId}`);
		log(`Page: ${baseUrl}${result.path}`);
		log(`Log in & open: ${baseUrl}${result.logInUrl}`);
		break;
	}
	case "requests": {
		const count = Number(rest[0] ?? 20);
		const { requests } = await get<DevRequestsLoaderData>("/dev/requests");
		for (const request of requests.slice(0, count).reverse()) {
			const repeated = request.mostRepeatedCount
				? `  repeated ×${request.mostRepeatedCount}`
				: "";
			const errors = request.errorCount ? `  ${request.errorCount} failed` : "";
			log(
				[
					`#${request.id}`.padEnd(6),
					`${request.kind === "action" ? request.method : request.kind}`.padEnd(
						9,
					),
					String(request.status ?? "…").padEnd(4),
					formatMs(request.durationMs).padStart(8),
					`${request.queryCount} queries (${formatMs(request.queryDurationMs)})`.padEnd(
						22,
					),
					`${request.path}${repeated}${errors}`,
				].join(" "),
			);
		}
		break;
	}
	case "request": {
		const [id] = rest;
		if (!id) exitWithHelp();

		const { request, repeatedQueries } = await get<DevRequestLoaderData>(
			`/dev/requests/${id}`,
		);
		log(
			`${request.method} ${request.path} → ${request.status ?? "…"} in ${formatMs(request.durationMs)}\n`,
		);
		for (const query of repeatedQueries) {
			log(`Repeated ×${query.count}: ${query.sql}\n`);
		}
		for (const query of request.queries) {
			log(`[${formatMs(query.durationMs)}] ${query.sql}`);
			if (query.parameters.length > 0) {
				log(`  ${JSON.stringify(query.parameters)}`);
			}
			if (query.error) log(`  ERROR ${query.error}`);
		}
		break;
	}
	case "log-in-as": {
		const [userId, path = "/"] = rest;
		if (!userId) exitWithHelp();

		const search = new URLSearchParams({ returnTo: path });
		if (userId !== "me") search.set("userId", userId);

		log(`${baseUrl}/dev/log-in-as?${search}`);
		break;
	}
	case "server": {
		const server = await get<DevServerLoaderData>("/dev/server");
		log(
			`Database: ${server.database.file}${server.database.isReseedable ? "" : " (not reseedable)"}`,
		);
		log(`Web push configured: ${server.webPushEnabled ? "yes" : "no"}`);
		for (const [name, value] of Object.entries(server.switches)) {
			log(`Switch ${name}: ${value ? "on" : "off"}`);
		}
		for (const schedule of server.routineSchedules) {
			log(`${schedule.schedule}: ${schedule.names.join(", ")}`);
		}
		break;
	}
	case "switch": {
		const [name, value] = rest;
		if (!name || (value !== "on" && value !== "off")) exitWithHelp();

		await post<DevServerActionData>("/dev/server", {
			_action: "SET_SWITCH",
			switch: name,
			value: value === "on",
		});
		log(`${name} ${value}`);
		break;
	}
	case "routine": {
		const [name] = rest;
		if (!name) exitWithHelp();

		const result = await post<DevServerActionData>("/dev/server", {
			_action: "RUN_ROUTINE",
			name,
		});
		log(
			result.ok
				? `${name} finished in ${formatMs(result.durationMs)}`
				: `${name} threw, see the dev server's terminal`,
		);
		break;
	}
	case "refresh-caches": {
		const result = await post<DevServerActionData>("/dev/server", {
			_action: "REFRESH_CACHES",
		});
		log(`Caches refreshed in ${formatMs(result.durationMs)}`);
		break;
	}
	default:
		exitWithHelp();
}

async function get<T>(path: string): Promise<T> {
	return parse<T>(await send(path, { method: "GET" }));
}

async function post<T>(path: string, body: unknown): Promise<T> {
	return parse<T>(
		await send(path, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}),
	);
}

async function send(path: string, init: RequestInit) {
	try {
		return await fetch(`${baseUrl}${path}`, init);
	} catch (error) {
		logError(
			`Could not reach the dev server at ${baseUrl}, is it running? (${error instanceof Error ? error.message : error})`,
		);
		process.exit(1);
	}
}

async function parse<T>(response: Response): Promise<T> {
	if (!response.ok) {
		const message = await response
			.json()
			.then((json: { error?: unknown }) => json?.error)
			.catch(() => null);
		logError(
			typeof message === "string"
				? message
				: `${response.status} from ${response.url}${response.status === 404 ? " (unknown id, or not a dev server)" : ""}`,
		);
		process.exit(1);
	}

	return (await response.json()) as T;
}

function formatMs(ms: number | null) {
	if (ms === null) return "…";

	return ms < 10 ? `${ms.toFixed(1)}ms` : `${Math.round(ms)}ms`;
}

function log(message: string) {
	// biome-ignore lint/suspicious/noConsole: CLI script output
	console.log(message);
}

function logError(message: string) {
	// biome-ignore lint/suspicious/noConsole: CLI script output
	console.error(message);
}

function exitWithHelp(): never {
	log(HELP);
	process.exit(command ? 1 : 0);
}
