import type { ChatRoomType } from "~/features/chat/chat-types";

/** SendouQ only during the beta. */
export const VOICE_ROOM_TYPES = [
	"SQ_GROUP",
	"SQ_MATCH",
] as const satisfies ChatRoomType[];

export const VOICE_TOKEN_LIFETIME_MINUTES = 120;
export const VOICE_MONTHLY_BUDGET_USD = 500;
export const VOICE_FREE_MINUTES_PER_MONTH = 10_000;
export const VOICE_PRICE_PER_MINUTE_USD = 0.00099;

export const VOICE_TELEMETRY_INTERVAL_MS = 60_000;
export const VOICE_FEEDBACK_MIN_SESSION_SECONDS = 120;
export const VOICE_FEEDBACK_COOLDOWN_HOURS = 24;
export const VOICE_FEEDBACK_COMMENT_MAX_LENGTH = 500;

/** How often a room's in-memory presence is reconciled with Daily's */
export const VOICE_PRESENCE_RECONCILE_INTERVAL_MS = 30_000;

export const VOICE_PLATFORMS = ["DESKTOP", "ANDROID", "IOS"] as const;
export type VoicePlatform = (typeof VOICE_PLATFORMS)[number];

export const VOICE_LEAVE_REASONS = [
	"LEFT",
	"PAGE_CLOSED",
	"KICKED",
	"EJECTED",
	"TOKEN_EXPIRED",
	"CONNECTION_LOST",
] as const;
export type VoiceLeaveReason = (typeof VOICE_LEAVE_REASONS)[number];

export const VOICE_CLIENT_ERROR_KINDS = [
	"MIC_DENIED",
	"MIC_NOT_FOUND",
	"AUTOPLAY_BLOCKED",
	"JOIN_FAILED",
] as const;
export type VoiceClientErrorKind = (typeof VOICE_CLIENT_ERROR_KINDS)[number];

export const VOICE_INPUT_MODES = ["PUSH_TO_TALK", "OPEN_MIC"] as const;
export type VoiceInputMode = (typeof VOICE_INPUT_MODES)[number];

/** Daily's network state as reported in its `participant.left` webhook. */
export const VOICE_NETWORK_QUALITY_STATES = [
	"good",
	"warning",
	"bad",
	"unknown",
] as const;
export type VoiceNetworkQualityState =
	(typeof VOICE_NETWORK_QUALITY_STATES)[number];
