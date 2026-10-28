import * as v from "valibot";
import { SAMPLE_NOTIFICATION_TYPES } from "./dev-tools-constants";

export const runScenarioSchema = v.object({
	scenarioId: v.string(),
	params: v.optional(
		v.record(v.string(), v.union([v.string(), v.number()])),
		{},
	),
});

export const DEV_SWITCHES = ["seasonEnded", "plusVotingActive"] as const;

export const devServerActionSchema = v.variant("_action", [
	v.object({
		_action: v.literal("SET_SWITCH"),
		switch: v.picklist(DEV_SWITCHES),
		value: v.boolean(),
	}),
	v.object({ _action: v.literal("REFRESH_CACHES") }),
	v.object({ _action: v.literal("RESEED") }),
	v.object({ _action: v.literal("RUN_ROUTINE"), name: v.string() }),
]);

export const sendNotificationSchema = v.object({
	type: v.union([v.picklist(SAMPLE_NOTIFICATION_TYPES), v.literal("ALL")]),
});
