import { defineAction } from "~/form/define-action.server";
import * as VoiceAvailability from "../core/VoiceAvailability.server";
import * as VoiceRepository from "../VoiceRepository.server";
import { voiceDashboardActionSchema } from "../voice-schemas";
import { requireVoiceDashboardAccess } from "../voice-utils.server";

export const action = defineAction(
	{ body: voiceDashboardActionSchema },
	async ({ body }) => {
		requireVoiceDashboardAccess();

		await VoiceRepository.updateSettings({
			isDisabled: body._action === "DISABLE",
		});
		VoiceAvailability.clearCache();

		return null;
	},
);
