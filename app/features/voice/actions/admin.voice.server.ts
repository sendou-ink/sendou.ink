import type { ActionFunctionArgs } from "react-router";
import { parseRequestPayload } from "~/utils/remix.server";
import * as VoiceAvailability from "../core/VoiceAvailability.server";
import * as VoiceRepository from "../VoiceRepository.server";
import { voiceDashboardActionSchema } from "../voice-schemas";
import { requireVoiceDashboardAccess } from "../voice-utils.server";

export const action = async ({ request }: ActionFunctionArgs) => {
	requireVoiceDashboardAccess();
	const data = await parseRequestPayload({
		request,
		schema: voiceDashboardActionSchema,
	});

	await VoiceRepository.updateSettings({
		isDisabled: data._action === "DISABLE",
	});
	VoiceAvailability.clearCache();

	return null;
};
