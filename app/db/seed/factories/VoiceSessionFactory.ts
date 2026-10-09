import * as VoiceRepository from "~/features/voice/VoiceRepository.server";
import { actAs } from "../core/actAs";
import { backdate } from "../core/backdate";
import { defineFactory } from "../core/defineFactory";

type InsertArgs = Parameters<typeof VoiceRepository.insertOwnSession>[0] & {
	/** Who asked to join. */
	userId: number;
};

type Options = {
	dailySessionId?: string;
	connectedAt?: Date;
	createdAt?: Date;
};

export const { create } = defineFactory({
	defaults: () => ({
		roomId: null,
		roomType: "SQ_MATCH" as const,
		platform: "DESKTOP" as const,
		eligibleMemberCount: 8,
	}),
	insert: async ({ userId, ...args }: InsertArgs) => {
		const id = await actAs(userId, () =>
			VoiceRepository.insertOwnSession(args),
		);

		return { id, userId };
	},
	applyOptions: async (
		session,
		{ dailySessionId, connectedAt, createdAt }: Options,
	) => {
		if (dailySessionId) {
			await actAs(session.userId, () =>
				VoiceRepository.markOwnSessionConnected({
					id: session.id,
					dailySessionId,
				}),
			);
		}

		await backdate("VoiceSession", session.id, { connectedAt, createdAt });
	},
});
