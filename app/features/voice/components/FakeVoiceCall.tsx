import * as React from "react";
import { useUser } from "~/features/auth/core/user";
import { eventsClient } from "~/features/events/events-client";
import { voiceClient } from "../voice-client";
import { useVoiceSnapshot } from "../voice-hooks";

/** E2E stand-in for `VoiceCall`: connects at once without Daily, its participants the room's presence. */
export function FakeVoiceCall({
	roomId,
	token,
}: {
	roomId: number;
	roomUrl: string;
	token: string;
}) {
	const user = useUser();
	const { roomsById } = useVoiceSnapshot();
	const presentUserIds = roomsById.get(roomId)?.userIds ?? [];
	const presentUserIdsKey = presentUserIds.join(",");

	React.useEffect(() => {
		voiceClient.registerCallHandle({
			setLocalAudio: () => {},
			leave: async () => {},
			resumeAudio: () => {},
		});
		voiceClient.markConnected(token);

		return () => voiceClient.registerCallHandle(null);
	}, [token]);

	React.useEffect(
		() =>
			eventsClient.addEventListener((event) => {
				if (event.kind !== "voiceEjected" || event.token !== token) return;
				void voiceClient.leave("EJECTED");
			}),
		[token],
	);

	React.useEffect(() => {
		if (!user) return;

		const userIds = new Set([
			user.id,
			...presentUserIdsKey.split(",").filter(Boolean).map(Number),
		]);
		voiceClient.updateParticipants(
			[...userIds].map((userId) => ({
				userId,
				sessionId: String(userId),
				isLocal: userId === user.id,
				audioEnabled: false,
			})),
		);
	}, [user, presentUserIdsKey]);

	return null;
}
