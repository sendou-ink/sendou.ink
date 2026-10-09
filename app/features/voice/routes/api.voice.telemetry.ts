import type { ActionFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import { notFoundIfNullish, parseBody } from "~/utils/remix.server";
import * as VoiceRepository from "../VoiceRepository.server";
import { voiceTelemetrySchema } from "../voice-schemas";

export const action = async ({ request }: ActionFunctionArgs) => {
	requireUser();
	const data = await parseBody({ request, schema: voiceTelemetrySchema });

	switch (data.kind) {
		case "SUMMARY": {
			notFoundIfNullish(
				await VoiceRepository.findOwnSessionById(data.voiceSessionId),
			);

			await VoiceRepository.updateOwnSessionSummary({
				id: data.voiceSessionId,
				lowQualitySeconds: data.lowQualitySeconds,
				talkSeconds: data.talkSeconds,
				inputMode: data.inputMode,
			});
			break;
		}
		case "ERROR": {
			const session =
				data.voiceSessionId === null
					? undefined
					: await VoiceRepository.findOwnSessionById(data.voiceSessionId);

			await VoiceRepository.insertOwnClientError({
				voiceSessionId: session?.id ?? null,
				kind: data.errorKind,
				detail: data.detail,
				platform: data.platform,
			});
			break;
		}
		case "FEEDBACK": {
			notFoundIfNullish(
				await VoiceRepository.findOwnSessionById(data.voiceSessionId),
			);

			await VoiceRepository.insertOwnFeedback({
				voiceSessionId: data.voiceSessionId,
				rating: data.rating,
				comment: data.comment || null,
			});
			break;
		}
	}

	return null;
};
