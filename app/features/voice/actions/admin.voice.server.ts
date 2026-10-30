import { defineAction } from "~/form/define-action.server";
import * as VoiceAvailability from "../core/VoiceAvailability.server";
import * as VoiceRepository from "../VoiceRepository.server";
import { voiceDashboardActionSchema } from "../voice-schemas";
import { requireVoiceDashboardAccess } from "../voice-utils.server";

export const action = defineAction(
	{ body: voiceDashboardActionSchema },
	async ({ body }) => {
		requireVoiceDashboardAccess();

		switch (body._action) {
			case "DISABLE":
			case "ENABLE": {
				await VoiceRepository.updateSettings({
					isDisabled: body._action === "DISABLE",
				});
				break;
			}
			case "DISABLE_FEATURE":
			case "ENABLE_FEATURE": {
				await VoiceRepository.updateSettings({
					feature: body.feature,
					isDisabled: body._action === "DISABLE_FEATURE",
				});
				break;
			}
		}
		VoiceAvailability.clearCache();

		return null;
	},
);
