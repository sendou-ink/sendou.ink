import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./ast.ts";

/** The `/api/` requests the e2e tests made in the last capture, written by `capture.ts`. */
export const API_EXAMPLES_FILE = "docs/site/api-examples.json";

export interface ApiExchange {
	method: string;
	/** Pathname and search, e.g. `/api/tournament/3/teams`. */
	path: string;
	status: number;
	/** The JSON sent, null for none. */
	requestBody: unknown;
	/** The JSON responded with, long arrays cut short, null for a response that isn't JSON. */
	responseBody: unknown;
	/** The e2e test making the request. */
	test: { spec: string; titlePath: string[]; line: number };
}

export function readApiExamples(): ApiExchange[] {
	const file = path.join(ROOT, API_EXAMPLES_FILE);
	if (!fs.existsSync(file)) return [];

	return JSON.parse(fs.readFileSync(file, "utf8"));
}

/** The captured requests of an endpoint (`/api/team/{teamId}`), the first one of each status code. */
export function examplesOf(
	exchanges: ApiExchange[],
	endpoint: { method: string; path: string },
) {
	const pattern = new RegExp(
		`^${endpoint.path
			.split(/\{[^}]+\}/)
			.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
			.join("[^/]+")}$`,
	);
	const byStatus = new Map<number, ApiExchange>();
	for (const exchange of exchanges) {
		if (exchange.method !== endpoint.method) continue;
		if (!pattern.test(exchange.path.split("?")[0])) continue;
		if (!byStatus.has(exchange.status)) {
			byStatus.set(exchange.status, exchange);
		}
	}

	return [...byStatus.values()].sort((a, b) => a.status - b.status);
}
