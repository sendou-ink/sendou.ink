// @ts-nocheck

import fs from "node:fs";
import { abilitiesShort } from "~/modules/in-game-lists";
import invariant from "~/utils/invariant";
import {
	LANG_JSONS_TO_CREATE,
	loadLangDicts,
	translationJsonFolderName,
} from "./utils";

import path from "node:path";
import { fileURLToPath } from "node:url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

		fs.writeFileSync(
			path.join(
				__dirname,
				"..",
				"locales",
				translationJsonFolderName(langCode),
				"game-misc.json",
			),
			`${JSON.stringify(translationsMap, null, 2)}\n`,
		);
	}
}

void main();
