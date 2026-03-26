import type { z } from "zod";
import { STAFF_DISCORD_IDS } from "~/features/admin/admin-constants";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { fetchWithTimeout } from "~/utils/fetch";
import { logger } from "~/utils/logger";
import type { Unpacked } from "~/utils/types";
import {
	PATREON_INITIAL_URL,
	TIER_1_ID,
	TIER_2_ID,
	TIER_3_ID,
	TIER_4_ID,
	UNKNOWN_TIER_ID,
} from "./constants";
import { patreonRateLimitSchema, patronResponseSchema } from "./schema";

export async function updatePatreonData(): Promise<void> {
	const patrons: UserRepository.UpdatePatronDataArgs = [];
	const noDiscordConnected: Array<string> = [];
	const noDataIds: Array<string> = [];
	let nextUrlToFetchWith = PATREON_INITIAL_URL;

	while (nextUrlToFetchWith) {
		const patronData = await fetchPatronData(nextUrlToFetchWith);

		const parsed = parsePatronData(patronData);
		patrons.push(...parsed.patrons);
		noDiscordConnected.push(...parsed.noDiscordConnection);
		noDataIds.push(...parsed.noDataIds);

		// TS freaks out if we don't keep nextUrlToFetchWith string so that's why this weird thing here
		nextUrlToFetchWith = patronData.links?.next ?? "";
	}

	const patronsWithMods: UserRepository.UpdatePatronDataArgs = [
		...patrons,
		...STAFF_DISCORD_IDS.filter((discordId) =>
			patrons.every((p) => p.discordId !== discordId),
		).map((discordId) => ({
			discordId,
			patronTier: 4,
			patronSince: dateToDatabaseTimestamp(new Date()),
		})),
	];

	await UserRepository.updatePatronData(patronsWithMods);
}

const MAX_RETRIES = 10;
const DEFAULT_RETRY_AFTER_SECONDS = 10;
const MAX_RETRY_AFTER_SECONDS = 60;

async function fetchPatronData(urlToFetch: string) {
	if (!process.env.PATREON_ACCESS_TOKEN) {
		throw new Error("Missing Patreon access token");
	}

	for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
		const response = await fetchWithTimeout(
			urlToFetch,
			{
				headers: {
					Authorization: `Bearer ${process.env.PATREON_ACCESS_TOKEN}`,
				},
			},
			30_000,
		);

		if (response.status === 429) {
			if (attempt === MAX_RETRIES) {
				throw new Error(
					`Patreon rate limit exceeded after ${MAX_RETRIES} retries`,
				);
			}

			const parsed = patreonRateLimitSchema.safeParse(await response.json());
			const retryAfterSeconds = Math.min(
				parsed.success
					? (parsed.data.errors[0]?.retry_after_seconds ??
							DEFAULT_RETRY_AFTER_SECONDS)
					: DEFAULT_RETRY_AFTER_SECONDS,
				MAX_RETRY_AFTER_SECONDS,
			);

			logger.warn(
				`Patreon rate limited, retrying in ${retryAfterSeconds}s (attempt ${attempt + 1}/${MAX_RETRIES})`,
			);
			await sleep(retryAfterSeconds * 1000);
			continue;
		}

		if (!response.ok) {
			throw new Error(
				`Patreon response not successful. Status code was: ${response.status}`,
			);
		}

		return patronResponseSchema.parse(await response.json());
	}

	throw new Error("Unexpected end of fetch retry loop");
}

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePatronData({
	data,
	included,
}: z.infer<typeof patronResponseSchema>) {
	const patronsWithIds: Array<
		{
			patreonId: string;
		} & Omit<Unpacked<UserRepository.UpdatePatronDataArgs>, "discordId">
	> = [];

	for (const patron of data) {
		if (patron.relationships.currently_entitled_tiers.data.length === 0) {
			continue;
		}

		const tier = [TIER_4_ID, TIER_3_ID, TIER_2_ID, TIER_1_ID].find((id) =>
			patron.relationships.currently_entitled_tiers.data.some(
				(tier) => tier.id === id,
			),
		);

		patronsWithIds.push({
			patreonId: patron.relationships.user.data.id,
			patronSince: dateToDatabaseTimestamp(
				new Date(patron.attributes.pledge_relationship_start ?? Date.now()),
			),
			patronTier: idToTierNumber(tier),
		});
	}

	const result: {
		patrons: UserRepository.UpdatePatronDataArgs;
		noDiscordConnection: Array<string>;
		noDataIds: string[];
	} = {
		patrons: [],
		noDiscordConnection: [],
		noDataIds: [],
	};
	for (const extraData of included ?? []) {
		if (extraData.type !== "user") continue;

		const patronData = patronsWithIds.find((p) => p.patreonId === extraData.id);
		if (!patronData) {
			result.noDataIds.push(extraData.id);
			continue;
		}

		const discordId = extraData.attributes.social_connections?.discord?.user_id;
		if (!discordId) {
			result.noDiscordConnection.push(extraData.id);
			continue;
		}

		result.patrons.push({
			patronSince: patronData.patronSince,
			discordId,
			patronTier: patronData.patronTier,
		});
	}

	return result;
}

function idToTierNumber(id: string | undefined) {
	if (!id || id === UNKNOWN_TIER_ID) {
		return null;
	}

	const tier = [null, TIER_1_ID, TIER_2_ID, TIER_3_ID, TIER_4_ID].indexOf(id);

	if (tier === -1) {
		logger.warn("Unknown tier for patron", id);
		return null;
	}

	return tier;
}
