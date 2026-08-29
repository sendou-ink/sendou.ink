import { add } from "date-fns";

const PICKUP_CHAT_EXPIRES_AFTER_DAYS = 7;

/** When a pickup chat room expires: shortly after the tournament so it lasts through the event. */
export function pickupChatRoomExpiresAt(tournamentStartTime: Date) {
	return add(tournamentStartTime, { days: PICKUP_CHAT_EXPIRES_AFTER_DAYS });
}
