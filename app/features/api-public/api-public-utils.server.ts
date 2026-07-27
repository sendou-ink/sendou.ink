import * as ApiRepository from "~/features/api/ApiRepository.server";
import type { ApiTokenType } from "~/features/api/api-types";

type CachedToken = { type: ApiTokenType; userId: number };

async function loadApiTokensCache() {
	const dbTokens = await ApiRepository.findAllApiTokens();

	const tokenMap = new Map<string, CachedToken>();

	for (const { token, type, userId } of dbTokens) {
		tokenMap.set(token, { type, userId });
	}

	return tokenMap;
}

let apiTokens: Map<string, CachedToken> = await loadApiTokensCache();

export function getTokenInfo(token: string): CachedToken | undefined {
	return apiTokens.get(token);
}

export async function refreshApiTokensCache() {
	apiTokens = await loadApiTokensCache();
}
