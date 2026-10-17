import { addMinutes, subHours } from "date-fns";
import type { LoaderFunctionArgs } from "react-router";
import * as R from "remeda";
import { requireUser } from "~/features/auth/core/user.server";
import { userIsBanned } from "~/features/ban/core/banned.server";
import * as ChatRoomResolver from "~/features/chat/ChatRoomResolver.server";
import { defineAction } from "~/form/define-action.server";
import { databaseTimestampNow, dateToDatabaseTimestamp } from "~/utils/dates";
import { logger } from "~/utils/logger";
import {
	badRequestIfFalsy,
	forbidden,
	notFoundIfNullish,
	parseParams,
} from "~/utils/remix.server";
import { idObject } from "~/utils/schema";
import * as Daily from "../core/Daily.server";
import * as VoiceAccess from "../core/VoiceAccess";
import * as VoiceAvailability from "../core/VoiceAvailability.server";
import * as VoicePresence from "../core/VoicePresence.server";
import {
	VOICE_FEEDBACK_COOLDOWN_HOURS,
	VOICE_FEEDBACK_MIN_SESSION_SECONDS,
	VOICE_TOKEN_LIFETIME_MINUTES,
} from "../voice-constants";
import { voiceRoomActionSchema } from "../voice-schemas";
import * as VoiceRepository from "../VoiceRepository.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const user = requireUser();
	const { id: roomId } = parseParams({ params, schema: idObject });

	const room = await ChatRoomResolver.requireRoom(roomId, "VIEW");

	const available =
		VoiceAccess.isVoiceRoomType(room.type) &&
		(await VoiceAvailability.isAvailable());

	return {
		available,
		canJoin:
			available &&
			VoiceAccess.canJoin(room, user.id) &&
			!(await VoiceRepository.hasBeenKicked({ roomId, userId: user.id })),
		canKick: available && VoiceAccess.canKick(room, user.id),
		userIds: available ? await VoicePresence.reconciledUserIdsOf(room) : [],
	};
};

export const action = defineAction(
	{
		params: idObject,
		body: voiceRoomActionSchema,
		onInvalidBody: "badRequest",
	},
	async ({ params: { id: roomId }, body: data }) => {
		const user = requireUser();

		const room = await ChatRoomResolver.requireRoom(roomId, "VIEW");

		switch (data._action) {
			case "JOIN": {
				if (
					!VoiceAccess.canJoin(room, user.id) ||
					userIsBanned(user.id) ||
					(await VoiceRepository.hasBeenKicked({ roomId, userId: user.id }))
				) {
					forbidden();
				}
				badRequestIfFalsy(await VoiceAvailability.isAvailable());

				const tokenExpiresAt = Math.min(
					dateToDatabaseTimestamp(
						addMinutes(new Date(), VOICE_TOKEN_LIFETIME_MINUTES),
					),
					room.expiresAt,
				);

				await Daily.ensureRoom({
					chatRoomId: roomId,
					expiresAt: room.expiresAt,
				});
				// a refreshed pages old connection lingers on Dailys side and would show up as a second you
				await Daily.ejectUsers({
					chatRoomId: roomId,
					userIds: [user.id],
					ban: false,
				}).catch((error: unknown) => {
					logger.error("Ejecting the previous voice connection failed", error);
				});
				const token = await Daily.createMeetingToken({
					chatRoomId: roomId,
					userId: user.id,
					userName: user.username,
					expiresAt: tokenExpiresAt,
				});
				const voiceChatPreferences =
					await VoiceRepository.findVoiceChatPreferences(
						R.unique([...room.participantUserIds, user.id]),
					);
				const voiceSessionId = await VoiceRepository.insertOwnSession({
					roomId,
					roomType: room.type,
					platform: data.platform,
					eligibleMemberCount: voiceChatPreferences.filter(
						(preference) =>
							preference.vc !== "NO" &&
							room.participantUserIds.includes(preference.id),
					).length,
					vcPreference:
						voiceChatPreferences.find((preference) => preference.id === user.id)
							?.vc ?? "YES",
				});

				return {
					roomUrl: Daily.roomUrl(roomId),
					token,
					voiceSessionId,
				};
			}
			case "CONNECTED": {
				const session = notFoundIfNullish(
					await VoiceRepository.findOwnSessionById(data.voiceSessionId),
				);
				if (
					session.roomId !== roomId ||
					session.leftAt !== null ||
					!VoiceAccess.canJoin(room, user.id)
				) {
					forbidden();
				}

				await VoiceRepository.markOwnSessionConnected({
					id: data.voiceSessionId,
					dailySessionId: data.dailySessionId,
				});
				VoicePresence.add(room, user.id);

				return null;
			}
			case "LEAVE": {
				const session = notFoundIfNullish(
					await VoiceRepository.findOwnSessionById(data.voiceSessionId),
				);
				if (session.roomId !== roomId) forbidden();

				await VoiceRepository.markOwnSessionLeft({
					id: session.id,
					leaveReason: data.leaveReason,
				});
				VoicePresence.remove(room, [user.id]);

				return { askFeedback: await shouldAskFeedback(user.id, session) };
			}
			case "KICK": {
				if (!VoiceAccess.canKick(room, user.id)) forbidden();
				badRequestIfFalsy(data.userId !== user.id);

				// before ejecting, or the ejected client's own leave report wins the race
				await VoiceRepository.markSessionsLeft({
					roomId,
					userIds: [data.userId],
					leaveReason: "KICKED",
				});
				await Daily.ejectUsers({
					chatRoomId: roomId,
					userIds: [data.userId],
					ban: true,
				});
				VoicePresence.remove(room, [data.userId]);

				return null;
			}
		}
	},
);

async function shouldAskFeedback(
	userId: number,
	session: { connectedAt: number | null },
) {
	if (session.connectedAt === null) return false;
	if (
		databaseTimestampNow() - session.connectedAt <
		VOICE_FEEDBACK_MIN_SESSION_SECONDS
	) {
		return false;
	}

	return !(await VoiceRepository.hasFeedbackSince({
		userId,
		since: dateToDatabaseTimestamp(
			subHours(new Date(), VOICE_FEEDBACK_COOLDOWN_HOURS),
		),
	}));
}
