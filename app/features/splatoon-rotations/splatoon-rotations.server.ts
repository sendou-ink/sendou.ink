import { z } from "zod";
import type { TablesInsertable } from "~/db/tables";
import type { RankedModeShort } from "~/modules/in-game-lists/types";
import { SPLATOON3_INK_SCHEDULES_URL } from "~/utils/urls";

// xxx: use stagesObj, ensure that has all names on type level
const STAGE_NAME_TO_ID: Record<string, number> = {
	"Scorch Gorge": 0,
	"Eeltail Alley": 1,
	"Hagglefish Market": 2,
	"Undertow Spillway": 3,
	"Mincemeat Metalworks": 4,
	"Hammerhead Bridge": 5,
	"Museum d'Alfonsino": 6,
	"Mahi-Mahi Resort": 7,
	"Inkblot Art Academy": 8,
	"Sturgeon Shipyard": 9,
	MakoMart: 10,
	"Wahoo World": 11,
	"Flounder Heights": 12,
	"Brinewater Springs": 13,
	"Manta Maria": 14,
	"Um'ami Ruins": 15,
	"Humpback Pump Track": 16,
	"Barnacle & Dime": 17,
	"Crableg Capital": 18,
	"Shipshape Cargo Co.": 19,
	"Bluefin Depot": 20,
	"Robo ROM-en": 21,
	"Marlin Airport": 22,
	"Lemuria Hub": 23,
	"Urchin Underpass": 24,
};

const RULE_TO_MODE: Record<string, RankedModeShort> = {
	AREA: "SZ",
	LOFT: "TC",
	GOAL: "RM",
	CLAM: "CB",
};

const vsStageSchema = z.object({
	name: z.string(),
	image: z.object({ url: z.string() }),
});

const vsRuleSchema = z.object({
	name: z.string(),
	rule: z.string(),
});

const bankaraMatchSettingSchema = z.object({
	vsStages: z.array(vsStageSchema),
	vsRule: vsRuleSchema,
	bankaraMode: z.enum(["CHALLENGE", "OPEN"]),
});

const bankaraNodeSchema = z.object({
	startTime: z.string(),
	endTime: z.string(),
	bankaraMatchSettings: z.array(bankaraMatchSettingSchema).nullable(),
});

const xMatchSettingSchema = z
	.object({
		vsStages: z.array(vsStageSchema),
		vsRule: vsRuleSchema,
	})
	.nullable();

const xNodeSchema = z.object({
	startTime: z.string(),
	endTime: z.string(),
	xMatchSetting: xMatchSettingSchema,
});

const schedulesSchema = z.object({
	data: z.object({
		bankaraSchedules: z.object({
			nodes: z.array(bankaraNodeSchema),
		}),
		xSchedules: z.object({
			nodes: z.array(xNodeSchema),
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
	const parsed = schedulesSchema.parse(json);

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
				startTime: Math.floor(new Date(node.startTime).getTime() / 1000),
				endTime: Math.floor(new Date(node.endTime).getTime() / 1000),
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
			startTime: Math.floor(new Date(node.startTime).getTime() / 1000),
			endTime: Math.floor(new Date(node.endTime).getTime() / 1000),
		});
	}

	return rotations;
}
