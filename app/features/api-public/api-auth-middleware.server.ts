import { userAsyncLocalStorage } from "~/features/auth/core/user-context.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { getTokenInfo } from "./api-public-utils.server";

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

export const apiAuthMiddleware: MiddlewareFn = async ({ request }, next) => {
	if (request.method === "OPTIONS") {
		return next();
	}

	const token = extractToken(request);
	if (!token) {
		return new Response("Missing Authorization header", { status: 401 });
	}

	const tokenInfo = getTokenInfo(token);
	if (!tokenInfo) {
		return new Response("Invalid token", { status: 401 });
	}

	if (request.method === "POST" && tokenInfo.type !== "write") {
		return new Response("Write token required", { status: 403 });
	}

	if (request.method === "POST") {
		const user = await UserRepository.findLeanById(tokenInfo.userId);
		if (!user) {
			return new Response("User not found", { status: 401 });
		}
		return userAsyncLocalStorage.run({ user }, () => next());
	}

	return next();
};
