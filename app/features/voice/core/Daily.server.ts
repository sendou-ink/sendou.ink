import { createHmac, timingSafeEqual } from "node:crypto";
import * as v from "valibot";
import { ServerConfig } from "~/config.server";
import { logger } from "~/utils/logger";

const API_URL = "https://api.daily.co/v1";
const REQUEST_TIMEOUT_MS = 8_000;
const ROOM_NAME_PREFIX = ServerConfig.isProduction ? "chat" : "dev-chat";

const presenceSchema = v.object({
	data: v.array(
		v.object({
			userId: v.nullish(v.string()),
		}),
	),
});

const tokenSchema = v.object({ token: v.string() });

export function isConfigured() {
	return Boolean(ServerConfig.daily.apiKey && ServerConfig.daily.domain);
}

export function roomName(chatRoomId: number) {
	return `${ROOM_NAME_PREFIX}-${chatRoomId}`;
}

export function chatRoomIdFromRoomName(name: string) {
	const match = new RegExp(`^${ROOM_NAME_PREFIX}-(\\d+)$`).exec(name);
	if (!match) return null;

	return Number(match[1]);
}

export function roomUrl(chatRoomId: number) {
	return `https://${ServerConfig.daily.domain}.daily.co/${roomName(chatRoomId)}`;
}

export async function ensureRoom({
	chatRoomId,
	expiresAt,
}: {
	chatRoomId: number;
	expiresAt: number;
}) {
	const response = await request("/rooms", {
		method: "POST",
		body: {
			name: roomName(chatRoomId),
			privacy: "private",
			properties: {
				exp: expiresAt,
				eject_at_room_exp: true,
				start_video_off: true,
				enable_screenshare: false,
				enable_chat: false,
				enable_prejoin_ui: false,
				permissions: { canSend: ["audio"] },
			},
		},
		allowFailure: true,
	});
	if (response.ok) return;

	const body = await response.text();
	if (!body.includes("already exists")) {
		throw new Error(`Daily room creation failed (${response.status}): ${body}`);
	}

	// Extend the expiry in case the group decides to re-enter Q
	await request(`/rooms/${roomName(chatRoomId)}`, {
		method: "POST",
		body: { properties: { exp: expiresAt } },
	});
}

export async function createMeetingToken({
	chatRoomId,
	userId,
	userName,
	expiresAt,
}: {
	chatRoomId: number;
	userId: number;
	userName: string;
	expiresAt: number;
}) {
	const response = await request("/meeting-tokens", {
		method: "POST",
		body: {
			properties: {
				room_name: roomName(chatRoomId),
				user_id: String(userId),
				user_name: userName,
				exp: expiresAt,
				eject_at_token_exp: true,
				start_video_off: true,
				permissions: { canSend: ["audio"], hasPresence: true },
			},
		},
	});

	return v.parse(tokenSchema, await response.json()).token;
}

export async function ejectUsers({
	chatRoomId,
	userIds,
	ban,
}: {
	chatRoomId: number;
	userIds: number[];
	ban: boolean;
}) {
	if (userIds.length === 0) return;

	await request(`/rooms/${roomName(chatRoomId)}/eject`, {
		method: "POST",
		body: { user_ids: userIds.map(String), ban },
	});
}

export async function findPresentUserIds(chatRoomId: number) {
	const response = await request(`/rooms/${roomName(chatRoomId)}/presence`, {
		method: "GET",
		allowFailure: true,
	});

	if (response.status === 404) return [];
	if (!response.ok) {
		throw new Error(`Daily presence fetch failed (${response.status})`);
	}

	const { data } = v.parse(presenceSchema, await response.json());

	return data.flatMap((participant) => {
		const userId = Number(participant.userId);
		return Number.isInteger(userId) && userId > 0 ? [userId] : [];
	});
}

export function isValidWebhookSignature({
	rawBody,
	timestamp,
	signature,
	secret,
}: {
	rawBody: string;
	timestamp: string;
	signature: string;
	secret: string;
}) {
	const expected = createHmac("sha256", Buffer.from(secret, "base64"))
		.update(`${timestamp}.${rawBody}`)
		.digest();
	const received = Buffer.from(signature, "base64");

	return (
		received.length === expected.length && timingSafeEqual(received, expected)
	);
}

async function request(
	path: string,
	{
		method,
		body,
		allowFailure = false,
	}: {
		method: "GET" | "POST";
		body?: unknown;
		allowFailure?: boolean;
	},
) {
	const response = await fetch(`${API_URL}${path}`, {
		method,
		headers: {
			Authorization: `Bearer ${ServerConfig.daily.apiKey}`,
			"Content-Type": "application/json",
		},
		body: body === undefined ? undefined : JSON.stringify(body),
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	});

	if (!response.ok && !allowFailure) {
		const text = await response.text();
		logger.error(
			`Daily ${method} ${path} failed (${response.status}): ${text}`,
		);
		throw new Error(`Daily request failed (${response.status})`);
	}

	return response;
}
