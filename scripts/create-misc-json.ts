// @ts-nocheck

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { abilitiesShort } from "~/modules/in-game-lists/abilities";
import { brandIds } from "~/modules/in-game-lists/brand-ids";
import invariant from "~/utils/invariant";
import {
	LANG_JSONS_TO_CREATE,
	loadLangDicts,
	translationJsonFolderName,
} from "./utils";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BADGE_DIR = path.join(__dirname, "badge");
const OUTPUT_DIR = path.join(__dirname, "output");

const ALL_LOCALE_FOLDERS = [
	"da",
	"de",
	"en",
	"es-ES",
	"es-US",
	"fr-CA",
	"fr-EU",
	"he",
	"it",
	"ja",
	"ko",
	"nl",
	"pl",
	"pt-BR",
	"ru",
	"zh",
];

const BADGE_TEMPLATE_RULES = [
	{
		prefix: "CoopGrade_Normal_",
		templateKey: "CoopGrade_Normal_",
		lookupDict: "CommonMsg/Coop/CoopStageName",
	},
	{
		prefix: "CoopGrade_Pair_",
		templateKey: "CoopGrade_Normal_",
		lookupDict: "CommonMsg/Coop/CoopStageName",
	},
	{
		prefix: "CoopGrade_Underground_",
		templateKey: "CoopGrade_Normal_",
		lookupDict: "CommonMsg/Coop/CoopStageName",
	},
	{
		prefix: "CoopBossKillNum_",
		templateKey: "CoopBossKillNum_",
		lookupDict: "CommonMsg/Coop/CoopEnemy",
	},
	{
		prefix: "CoopRareEnemyKillNum_",
		templateKey: "CoopRareEnemyKillNum_",
		lookupDict: "CommonMsg/Coop/CoopEnemy",
	},
	{
		prefix: "GearTotalRarity_",
		templateKey: "GearTotalRarity_",
		lookupDict: "CommonMsg/Gear/GearBrandName",
	},
	{
		prefix: "WinCount_WeaponSp_",
		templateKey: "WinCount_WeaponSp_",
		lookupDict: "CommonMsg/Weapon/WeaponName_Special",
	},
	{
		prefix: "WeaponLevel_",
		templateKey: "WeaponLevel_",
		lookupDict: "CommonMsg/Weapon/WeaponName_Main",
	},
];

// ⚠️ keep same order as https://github.com/IPLSplatoon/IPLMapGen2/blob/main/data.js
const stages = [
	"Scorch Gorge",
	"Eeltail Alley",
	"Hagglefish Market",
	"Undertow Spillway",
	"Mincemeat Metalworks",
	"Hammerhead Bridge",
	"Museum d'Alfonsino",
	"Mahi-Mahi Resort",
	"Inkblot Art Academy",
	"Sturgeon Shipyard",
	"MakoMart",
	"Wahoo World",
	"Flounder Heights",
	"Brinewater Springs",
	"Manta Maria",
	"Um'ami Ruins",
	"Humpback Pump Track",
	"Barnacle & Dime",
	"Crableg Capital",
	"Shipshape Cargo Co.",
	"Bluefin Depot",
	"Robo ROM-en",
	"Marlin Airport",
	"Lemuria Hub",
	"Urchin Underpass",
] as const;

const abilityShortToInternalName = new Map([
	["ISM", "MainInk_Save"],
	["ISS", "SubInk_Save"],
	["IRU", "InkRecovery_Up"],
	["RSU", "HumanMove_Up"],
	["SSU", "SquidMove_Up"],
	["SCU", "SpecialIncrease_Up"],
	["SS", "RespawnSpecialGauge_Save"],
	["SPU", "SpecialSpec_Up"],
	["QR", "RespawnTime_Save"],
	["QSJ", "JumpTime_Save"],
	["BRU", "SubSpec_Up"],
	["RES", "OpInkEffect_Reduction"],
	["SRU", "SubEffect_Reduction"],
	["IA", "Action_Up"],
	["OG", "StartAllUp"],
	["LDE", "EndAllUp"],
	["T", "MinorityUp"],
	["CB", "ComeBack"],
	["NS", "SquidMoveSpatter_Reduction"],
	["H", "DeathMarking"],
	["TI", "ThermalInk"],
	["RP", "Exorcist"],
	["AD", "ExSkillDouble"],
	["SJ", "SuperJumpSign_Hide"],
	["OS", "ObjectEffect_Up"],
	["DR", "SomersaultLanding"],
]);

async function main() {
	const langDicts = await loadLangDicts();

	const englishLangDict = langDicts.find(
		([langCode]) => langCode === "EUen",
	)?.[1];
	invariant(englishLangDict);

	const codeNames = stages.map((stage) => {
		const codeName = Object.entries(
			englishLangDict["CommonMsg/VS/VSStageName"],
		).find(([_key, value]) => value === stage)?.[0];

		invariant(codeName, `Could not find code name for stage ${stage}`);

		return codeName;
	});

	for (const langCode of LANG_JSONS_TO_CREATE) {
		const langDict = langDicts.find(([code]) => code === langCode)?.[1];
		invariant(langDict, `Missing translations for ${langCode}`);

		const translationsMap = Object.fromEntries(
			stages.map((_, i) => {
				const codeName = codeNames[
					i
				] as keyof (typeof langDict)["CommonMsg/VS/VSStageName"];
				invariant(codeName);

				return [`STAGE_${i}`, langDict["CommonMsg/VS/VSStageName"][codeName]];
			}),
		);

		for (const ability of abilitiesShort) {
			const internalName = abilityShortToInternalName.get(ability);
			invariant(internalName, `Missing internal name for ${ability}`);

			const translation = decodeURIComponent(
				langDict["CommonMsg/Gear/GearPowerName"][internalName],
			);

			translationsMap[`ABILITY_${ability}`] = translation;
		}

		for (const brandCode of brandIds) {
			const translation = decodeURIComponent(
				langDict["CommonMsg/Gear/GearBrandName"][brandCode],
			);

			translationsMap[`BRAND_${brandCode}`] = translation;
		}

		const jsonPath = path.join(
			__dirname,
			"..",
			"locales",
			translationJsonFolderName(langCode),
			"game-misc.json",
		);

		const jsonCurrentContents = fs.readFileSync(jsonPath, "utf-8");
		const jsonCurrent = JSON.parse(jsonCurrentContents);

		fs.writeFileSync(
			path.join(
				__dirname,
				"..",
				"locales",
				translationJsonFolderName(langCode),
				"game-misc.json",
			),
			`${JSON.stringify({ ...jsonCurrent, ...translationsMap }, null, 2)}\n`,
		);
	}

	generateBadgeData(langDicts);
}

function generateBadgeData(langDicts) {
	const badgeFiles = fs
		.readdirSync(BADGE_DIR)
		.filter((f) => f.endsWith(".png"));
	const badgeIds = badgeFiles
		.map((f) => f.replace("Badge_", "").replace(".png", ""))
		.sort();

	const englishDict = langDicts.find(([code]) => code === "EUen")?.[1];
	invariant(englishDict, "Missing English language dict");

	const englishBadgeTranslations = buildBadgeTranslations(
		badgeIds,
		englishDict,
	);

	for (const langCode of LANG_JSONS_TO_CREATE) {
		const langDict = langDicts.find(([code]) => code === langCode)?.[1];
		invariant(langDict, `Missing translations for ${langCode}`);

		const translationsMap = buildBadgeTranslations(badgeIds, langDict);

		const folder = translationJsonFolderName(langCode);
		writeBadgeJson(folder, translationsMap);
	}

	for (const folder of ALL_LOCALE_FOLDERS) {
		const jsonPath = path.join(
			__dirname,
			"..",
			"locales",
			folder,
			"game-badges.json",
		);
		if (fs.existsSync(jsonPath)) continue;

		writeBadgeJson(folder, englishBadgeTranslations);
	}

	if (!fs.existsSync(OUTPUT_DIR)) {
		fs.mkdirSync(OUTPUT_DIR, { recursive: true });
	}

	const tsContent = [
		"export const GAME_BADGE_IDS = [",
		...badgeIds.map((id) => `\t"${id}",`),
		"] as const;",
		"",
		"export type GameBadgeId = (typeof GAME_BADGE_IDS)[number];",
		"",
	].join("\n");

	fs.writeFileSync(path.join(OUTPUT_DIR, "game-badge-ids.ts"), tsContent);
}

function buildBadgeTranslations(badgeIds, langDict) {
	const badgeMsg = langDict["CommonMsg/Badge/BadgeMsg"];
	const translationsMap = {};

	for (const id of badgeIds) {
		if (badgeMsg[id] && !badgeMsg[id].includes("[group=")) {
			translationsMap[id] = badgeMsg[id];
			continue;
		}

		const lvMatch = id.match(/_Lv(\d+)$/);
		if (!lvMatch) {
			translationsMap[id] = badgeMsg[id] ?? id;
			continue;
		}

		const lvSuffix = `Lv${lvMatch[1]}`;

		const rule = BADGE_TEMPLATE_RULES.find((r) => id.startsWith(r.prefix));
		if (!rule) {
			translationsMap[id] = badgeMsg[id] ?? id;
			continue;
		}

		const variantName = id
			.slice(rule.prefix.length)
			.replace(`_${lvSuffix}`, "");

		const templateKey = `${rule.templateKey}${lvSuffix}`;
		const template = badgeMsg[templateKey];
		if (!template) {
			translationsMap[id] = id;
			continue;
		}

		const lookupValue = langDict[rule.lookupDict]?.[variantName];
		if (!lookupValue) {
			translationsMap[id] = id;
			continue;
		}

		translationsMap[id] = template.replace(
			/\[group=\d+ type=\w+ params=[\w ]+\]/,
			lookupValue,
		);
	}

	return translationsMap;
}

function writeBadgeJson(folder, translationsMap) {
	fs.writeFileSync(
		path.join(__dirname, "..", "locales", folder, "game-badges.json"),
		`${JSON.stringify(translationsMap, null, 2)}\n`,
	);
}

void main();
