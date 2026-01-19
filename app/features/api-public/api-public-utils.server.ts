import type { ApiTokenType } from "~/db/tables";
import * as ApiRepository from "~/features/api/ApiRepository.server";

async function loadApiTokensCache() {
	const envTokens = process.env.PUBLIC_API_TOKENS?.split(",") ?? [];
	const dbTokens = await ApiRepository.allApiTokens();

	const tokenMap = new Map<string, ApiTokenType>();

	for (const token of envTokens) {
		tokenMap.set(token, "write");
	}

	for (const { token, type } of dbTokens) {
		tokenMap.set(token, type);
	}

	return tokenMap;
}

let apiTokens = await loadApiTokensCache();

export async function refreshApiTokensCache() {
	apiTokens = await loadApiTokensCache();
}

function extractToken(req: Request) {
	const authHeader = req.headers.get("Authorization");
	if (!authHeader) {
		throw new Response("Missing Authorization header", { status: 401 });
	}
	return authHeader.replace("Bearer ", "");
}

export function requireBearerAuth(req: Request) {
	const token = extractToken(req);
	if (!apiTokens.has(token)) {
		throw new Response("Invalid token", { status: 401 });
	}
}

export function requireWriteAuth(req: Request) {
	const token = extractToken(req);
	const tokenType = apiTokens.get(token);

	if (!tokenType) {
		throw new Response("Invalid token", { status: 401 });
	}

	if (tokenType !== "write") {
		throw new Response("Write access required", { status: 403 });
	}
}
