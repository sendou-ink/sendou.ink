import * as ApiRepository from "~/features/api/ApiRepository.server";

async function loadApiTokensCache() {
	const envTokens = process.env.PUBLIC_API_TOKENS?.split(",") ?? [];
	const dbTokens = await ApiRepository.allApiTokens();
	return new Set([...envTokens, ...dbTokens]);
}

let apiTokens = await loadApiTokensCache();

export async function refreshApiTokensCache() {
	apiTokens = await loadApiTokensCache();
}

export function requireBearerAuth(req: Request) {
	const authHeader = req.headers.get("Authorization");
	if (!authHeader) {
		throw new Response("Missing Authorization header", { status: 401 });
	}
	const token = authHeader.replace("Bearer ", "");
	if (!apiTokens.has(token)) {
		throw new Response("Invalid token", { status: 401 });
	}
}
