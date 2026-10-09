import * as v from "valibot";
import { ServerConfig } from "~/config.server";
import * as ChatRoomResolver from "~/features/chat/ChatRoomResolver.server";
import { defineAction } from "~/form/define-action.server";
import { logger } from "~/utils/logger";
import * as Daily from "../core/Daily.server";
import * as VoicePresence from "../core/VoicePresence.server";
import * as VoiceRepository from "../VoiceRepository.server";
import { VOICE_NETWORK_QUALITY_STATES } from "../voice-constants";

const participantSchema = v.object({
	room: v.string(),
	user_id: v.nullish(v.string()),
	session_id: v.string(),
});

const eventSchema = v.variant("type", [
	v.object({
		type: v.literal("participant.joined"),
		payload: participantSchema,
	}),
	v.object({
		type: v.literal("participant.left"),
		payload: v.object({
			...participantSchema.entries,
			joined_at: v.number(),
			duration: v.number(),
			networkQualityState: v.optional(
				v.fallback(v.picklist(VOICE_NETWORK_QUALITY_STATES), "unknown"),
			),
		}),
	}),
]);

export const action = defineAction(async ({ request }) => {
	// biome-ignore lint/plugin: the signature covers the raw body bytes, which a parsed body can't reproduce
	const rawBody = await request.text();
	const secret = ServerConfig.daily.webhookSecret;

	// Daily checks a new webhook endpoint with an unsigned `{"test":"test"}`
	const parsed = v.safeParse(eventSchema, safeJsonParse(rawBody));
	if (!parsed.success || !secret) return null;

	const isSigned = Daily.isValidWebhookSignature({
		rawBody,
		timestamp: request.headers.get("X-Webhook-Timestamp") ?? "",
		signature: request.headers.get("X-Webhook-Signature") ?? "",
		secret,
	});
	if (!isSigned) {
		throw new Response(null, { status: 401 });
	}

	const event = parsed.output;
	const chatRoomId = Daily.chatRoomIdFromRoomName(event.payload.room);
	const userId = Number(event.payload.user_id);
	if (chatRoomId === null || !Number.isInteger(userId)) return null;

	if (event.type === "participant.left") {
		await VoiceRepository.updateFromLeftWebhook({
			dailySessionId: event.payload.session_id,
			durationSeconds: Math.round(event.payload.duration),
			networkQualityState: event.payload.networkQualityState ?? null,
			leftAt: Math.round(event.payload.joined_at + event.payload.duration),
		});
	}

	const room = await ChatRoomResolver.resolve(chatRoomId);
	if (!room) {
		logger.warn(`Voice webhook for unknown chat room ${chatRoomId}`);
		return null;
	}

	if (event.type === "participant.joined") {
		VoicePresence.add(room, userId);
	} else {
		VoicePresence.remove(room, [userId]);
	}

	return null;
});

function safeJsonParse(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}
