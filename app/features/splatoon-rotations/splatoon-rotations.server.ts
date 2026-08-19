import * as v from "valibot";
import gameMisc from "~/../locales/en/game-misc.json";
import type { TablesInsertable } from "~/db/tables";
import { stageIds } from "~/modules/in-game-lists/stage-ids";
import type { RankedModeShort } from "~/modules/in-game-lists/types";
import { SPLATOON3_INK_SCHEDULES_URL } from "~/utils/urls";

const STAGE_NAME_TO_ID = Object.fromEntries(
	stageIds.map((id) => [gameMisc[`STAGE_${id}` as keyof typeof gameMisc], id]),
) as Record<string, number>;

const RULE_TO_MODE: Record<string, RankedModeShort> = {
	AREA: "SZ",
	LOFT: "TC",
	GOAL: "RM",
	CLAM: "CB",
};

const vsStageSchema = v.object({
	name: v.string(),
	image: v.object({ url: v.string() }),
});

const vsRuleSchema = v.object({
	name: v.string(),
	rule: v.string(),
});

const bankaraMatchSettingSchema = v.object({
	vsStages: v.array(vsStageSchema),
	vsRule: vsRuleSchema,
	bankaraMode: v.picklist(["CHALLENGE", "OPEN"]),
});

const bankaraNodeSchema = v.object({
	startTime: v.string(),
	endTime: v.string(),
	bankaraMatchSettings: v.nullable(v.array(bankaraMatchSettingSchema)),
});

const xMatchSettingSchema = v.nullable(
	v.object({
		vsStages: v.array(vsStageSchema),
		vsRule: vsRuleSchema,
	}),
);

const xNodeSchema = v.object({
	startTime: v.string(),
	endTime: v.string(),
	xMatchSetting: xMatchSettingSchema,
});

const schedulesSchema = v.object({
	data: v.object({
		bankaraSchedules: v.object({
			nodes: v.array(bankaraNodeSchema),
		}),
		xSchedules: v.object({
			nodes: v.array(xNodeSchema),
		}),
	}),
});

function resolveStageId(stageName: string): number | null {
	return STAGE_NAME_TO_ID[stageName] ?? null;
}

function resolveMode(rule: string): RankedModeShort | null {
	return RULE_TO_MODE[rule] ?? null;
}

export async function fetchRotations(): Promise<
	Omit<TablesInsertable["SplatoonRotation"], "id">[]
> {
	const response = await fetch(SPLATOON3_INK_SCHEDULES_URL, {
		headers: { "User-Agent": "sendou.ink" },
	});

	if (!response.ok) {
		throw new Error(
			`Failed to fetch schedules: ${response.status} ${response.statusText}`,
		);
	}

	const json = await response.json();
	const parsed = v.parse(schedulesSchema, json);

	const rotations: Omit<TablesInsertable["SplatoonRotation"], "id">[] = [];

	for (const node of parsed.data.bankaraSchedules.nodes) {
		if (!node.bankaraMatchSettings) continue;

		for (const setting of node.bankaraMatchSettings) {
			const mode = resolveMode(setting.vsRule.rule);
			if (!mode) continue;

			const stageId1 = resolveStageId(setting.vsStages[0]?.name ?? "");
			const stageId2 = resolveStageId(setting.vsStages[1]?.name ?? "");
			if (stageId1 === null || stageId2 === null) continue;

			const type = setting.bankaraMode === "CHALLENGE" ? "SERIES" : "OPEN";

			rotations.push({
				type,
				mode,
				stageId1,
				stageId2,
				startsAt: Math.floor(new Date(node.startTime).getTime() / 1000),
				endsAt: Math.floor(new Date(node.endTime).getTime() / 1000),
			});
		}
	}

	for (const node of parsed.data.xSchedules.nodes) {
		if (!node.xMatchSetting) continue;

		const mode = resolveMode(node.xMatchSetting.vsRule.rule);
		if (!mode) continue;

		const stageId1 = resolveStageId(node.xMatchSetting.vsStages[0]?.name ?? "");
		const stageId2 = resolveStageId(node.xMatchSetting.vsStages[1]?.name ?? "");
		if (stageId1 === null || stageId2 === null) continue;

		rotations.push({
			type: "X",
			mode,
			stageId1,
			stageId2,
			startsAt: Math.floor(new Date(node.startTime).getTime() / 1000),
			endsAt: Math.floor(new Date(node.endTime).getTime() / 1000),
		});
	}

	return rotations;
}
