import { cors } from "remix-utils/cors";

const apiTokens = process.env.PUBLIC_API_TOKENS?.split(",") ?? [];
export function requireBearerAuth(req: Request) {
	const authHeader = req.headers.get("Authorization");
	if (!authHeader) {
		throw new Response("Missing Authorization header", { status: 401 });
	}
	const token = authHeader.replace("Bearer ", "");
	if (!apiTokens.includes(token)) {
		throw new Response("Invalid token", { status: 401 });
	}
}

export async function handleOptionsRequest(req: Request) {
	if (req.method === "OPTIONS") {
		throw await cors(req, new Response("OK", { status: 204 }), {
			origin: "*",
			credentials: true,
		});
	}
}
