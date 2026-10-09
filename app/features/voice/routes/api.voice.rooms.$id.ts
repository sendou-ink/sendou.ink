import { addMinutes, subHours } from "date-fns";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import { userIsBanned } from "~/features/ban/core/banned.server";
import * as ChatRoomResolver from "~/features/chat/ChatRoomResolver.server";
import { databaseTimestampNow, dateToDatabaseTimestamp } from "~/utils/dates";
import {
	badRequestIfFalsy,
	forbidden,
	notFoundIfNullish,
	parseBody,
	parseParams,
} from "~/utils/remix.server";
import { idObject } from "~/utils/schema";
import * as Daily from "../core/Daily.server";
import * as VoiceAccess from "../core/VoiceAccess";
import * as VoiceAvailability from "../core/VoiceAvailability.server";
import * as VoicePresence from "../core/VoicePresence.server";
import * as VoiceRepository from "../VoiceRepository.server";
import {
	VOICE_FEEDBACK_COOLDOWN_HOURS,
	VOICE_FEEDBACK_MIN_SESSION_SECONDS,
	VOICE_TOKEN_LIFETIME_MINUTES,
} from "../voice-constants";
import { voiceRoomActionSchema } from "../voice-schemas";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const user = requireUser();
	const { id: roomId } = parseParams({ params, schema: idObject });

	const room = await ChatRoomResolver.requireRoom(roomId, "VIEW");

	const available =
		VoiceAccess.isVoiceRoomType(room.type) &&
		(await VoiceAvailability.isAvailable());

	return {
		available,
		canJoin: available && VoiceAccess.canJoin(room, user.id),
		canKick: available && VoiceAccess.canKick(room, user.id),
		userIds: available ? await VoicePresence.reconciledUserIdsOf(room) : [],
	};
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
	const user = requireUser();
	const { id: roomId } = parseParams({ params, schema: idObject });
	const data = await parseBody({ request, schema: voiceRoomActionSchema });

	const room = await ChatRoomResolver.requireRoom(roomId, "VIEW");

	switch (data._action) {
		case "JOIN": {
			if (!VoiceAccess.canJoin(room, user.id) || userIsBanned(user.id)) {
				forbidden();
			}
			badRequestIfFalsy(await VoiceAvailability.isAvailable());

			const tokenExpiresAt = Math.min(
				dateToDatabaseTimestamp(
					addMinutes(new Date(), VOICE_TOKEN_LIFETIME_MINUTES),
				),
				room.expiresAt,
			);

			await Daily.ensureRoom({ chatRoomId: roomId, expiresAt: room.expiresAt });
			const token = await Daily.createMeetingToken({
				chatRoomId: roomId,
				userId: user.id,
				userName: user.username,
				expiresAt: tokenExpiresAt,
			});
			const voiceSessionId = await VoiceRepository.insertOwnSession({
				roomId,
				roomType: room.type,
				platform: data.platform,
				eligibleMemberCount: room.participantUserIds.length,
			});

			return {
				roomUrl: Daily.roomUrl(roomId),
				token,
				voiceSessionId,
			};
		}
		case "CONNECTED": {
			notFoundIfNullish(
				await VoiceRepository.findOwnSessionById(data.voiceSessionId),
			);

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

			await Daily.ejectUsers({
				chatRoomId: roomId,
				userIds: [data.userId],
				ban: true,
			});
			await VoiceRepository.markSessionsKicked({ roomId, userId: data.userId });
			VoicePresence.remove(room, [data.userId]);

			return null;
		}
	}
};

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
