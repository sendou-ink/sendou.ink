import * as v from "valibot";
import { _action, id } from "~/utils/schema";
import {
	VOICE_CLIENT_ERROR_KINDS,
	VOICE_FEEDBACK_COMMENT_MAX_LENGTH,
	VOICE_INPUT_MODES,
	VOICE_LEAVE_REASONS,
	VOICE_PLATFORMS,
	VOICE_TOKEN_LIFETIME_MINUTES,
} from "./voice-constants";

const MAX_SESSION_SECONDS = VOICE_TOKEN_LIFETIME_MINUTES * 60;

const seconds = v.pipe(
	v.number(),
	v.integer(),
	v.minValue(0),
	v.maxValue(MAX_SESSION_SECONDS),
);

const clientLeaveReasons = VOICE_LEAVE_REASONS.filter(
	(reason) => reason !== "KICKED",
);

export const voiceRoomActionSchema = v.variant("_action", [
	v.object({
		_action: v.literal("JOIN"),
		platform: v.picklist(VOICE_PLATFORMS),
	}),
	v.object({
		_action: v.literal("CONNECTED"),
		voiceSessionId: id,
		dailySessionId: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
	}),
	v.object({
		_action: v.literal("LEAVE"),
		voiceSessionId: id,
		leaveReason: v.picklist(clientLeaveReasons),
	}),
	v.object({
		_action: v.literal("KICK"),
		userId: id,
	}),
]);

export const voiceTelemetrySchema = v.variant("kind", [
	v.object({
		kind: v.literal("SUMMARY"),
		voiceSessionId: id,
		lowQualitySeconds: seconds,
		talkSeconds: seconds,
		inputMode: v.picklist(VOICE_INPUT_MODES),
	}),
	v.object({
		kind: v.literal("ERROR"),
		voiceSessionId: v.nullable(id),
		errorKind: v.picklist(VOICE_CLIENT_ERROR_KINDS),
		detail: v.nullable(v.pipe(v.string(), v.maxLength(500))),
		platform: v.picklist(VOICE_PLATFORMS),
	}),
	v.object({
		kind: v.literal("FEEDBACK"),
		voiceSessionId: id,
		rating: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(5)),
		comment: v.nullable(
			v.pipe(
				v.string(),
				v.trim(),
				v.maxLength(VOICE_FEEDBACK_COMMENT_MAX_LENGTH),
			),
		),
	}),
]);

export const voiceDashboardActionSchema = v.union([
	v.object({ _action: _action("DISABLE") }),
	v.object({ _action: _action("ENABLE") }),
]);
