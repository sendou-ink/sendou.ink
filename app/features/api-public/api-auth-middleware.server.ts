import { userAsyncLocalStorage } from "~/features/auth/core/user-context.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { getTokenInfo } from "./api-public-utils.server";

const USER_IDS_PATTERN = /^\/api\/user\/[^/]+\/ids$/;

type MiddlewareArgs = {
	request: Request;
	context: unknown;
};

type MiddlewareFn = (
	args: MiddlewareArgs,
	next: () => Promise<Response>,
) => Promise<Response>;

function extractToken(req: Request): string | null {
	const authHeader = req.headers.get("Authorization");
	if (!authHeader) return null;
	return authHeader.replace("Bearer ", "");
}

function isPublicRoute(request: Request): boolean {
	if (request.method !== "GET") return false;
	const url = new URL(request.url);
	return USER_IDS_PATTERN.test(url.pathname);
}

export const apiAuthMiddleware: MiddlewareFn = async ({ request }, next) => {
	if (request.method === "OPTIONS") {
		return next();
	}

	if (isPublicRoute(request)) {
		return next();
	}

	const token = extractToken(request);
	if (!token) {
		return Response.json(
			{ error: "Missing Authorization header" },
			{ status: 401 },
		);
	}

	const tokenInfo = getTokenInfo(token);
	if (!tokenInfo) {
		return Response.json({ error: "Invalid token" }, { status: 401 });
	}

	if (request.method === "POST" && tokenInfo.type !== "write") {
		return Response.json({ error: "Write token required" }, { status: 403 });
	}

	if (request.method === "POST") {
		const user = await UserRepository.findLeanById(tokenInfo.userId);
		if (!user) {
			return Response.json({ error: "User not found" }, { status: 401 });
		}
		return userAsyncLocalStorage.run({ user }, () => next());
	}

	return next();
};
