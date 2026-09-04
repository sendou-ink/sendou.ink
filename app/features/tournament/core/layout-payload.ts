import type { TournamentLoaderData } from "../loaders/to.$id.server";

/**
 * Serializes the tournament layout loader data. Counterpart of
 * {@link parseTournamentLoaderData}, the only way the payload should be read.
 */
export function serializeTournamentLoaderData(
	data: TournamentLoaderData,
): string {
	// JSON.stringify so that we skip expensive rr7 data serialization (hot path loader)
	return JSON.stringify(data);
}

/**
 * Parses the tournament layout loader data serialized by
 * {@link serializeTournamentLoaderData}.
 */
export function parseTournamentLoaderData(raw: string): TournamentLoaderData {
	return JSON.parse(raw) as TournamentLoaderData;
}
