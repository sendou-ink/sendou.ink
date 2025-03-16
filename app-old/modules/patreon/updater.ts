import type { z } from "zod";
import { MOD_DISCORD_IDS } from "~/constants";
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
import { patronResponseSchema } from "./schema";

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
		...MOD_DISCORD_IDS.filter((discordId) =>
			patrons.every((p) => p.discordId !== discordId),
		).map((discordId) => ({
			discordId,
			patronTier: 4,
			patronSince: dateToDatabaseTimestamp(new Date()),
		})),
	];

	await UserRepository.updatePatronData(patronsWithMods);
}

async function fetchPatronData(urlToFetch: string) {
	if (!process.env.PATREON_ACCESS_TOKEN) {
		throw new Error("Missing Patreon access token");
	}

	const response = await fetchWithTimeout(
		urlToFetch,
		{
			headers: {
				Authorization: `Bearer ${process.env.PATREON_ACCESS_TOKEN}`,
			},
		},
		30_000,
	);

	if (!response.ok) {
		throw new Error(
			`Patreon response not succesful. Status code was: ${response.status}`,
		);
	}

	return patronResponseSchema.parse(await response.json());
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
				new Date(
					patron.relationships.currently_entitled_tiers.data[0].attributes
						?.created_at ?? Date.now(),
				),
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
