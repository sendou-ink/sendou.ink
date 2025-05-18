// Reference for Ability Chunks of Primary Slot-Only abilities: https://splatoonwiki.org/wiki/Ability_chunk#Splatoon_3
export const abilities = [
	{ name: "ISM", type: "STACKABLE", abilityChunkTypesRequired: [] },
	{ name: "ISS", type: "STACKABLE", abilityChunkTypesRequired: [] },
	{ name: "IRU", type: "STACKABLE", abilityChunkTypesRequired: [] },
	{ name: "RSU", type: "STACKABLE", abilityChunkTypesRequired: [] },
	{ name: "SSU", type: "STACKABLE", abilityChunkTypesRequired: [] },
	{ name: "SCU", type: "STACKABLE", abilityChunkTypesRequired: [] },
	{ name: "SS", type: "STACKABLE", abilityChunkTypesRequired: [] },
	{ name: "SPU", type: "STACKABLE", abilityChunkTypesRequired: [] },
	{ name: "QR", type: "STACKABLE", abilityChunkTypesRequired: [] },
	{ name: "QSJ", type: "STACKABLE", abilityChunkTypesRequired: [] },
	{ name: "BRU", type: "STACKABLE", abilityChunkTypesRequired: [] },
	{ name: "RES", type: "STACKABLE", abilityChunkTypesRequired: [] },
	{ name: "SRU", type: "STACKABLE", abilityChunkTypesRequired: [] },
	{ name: "IA", type: "STACKABLE", abilityChunkTypesRequired: [] },
	{
		name: "OG",
		type: "HEAD_MAIN_ONLY",
		abilityChunkTypesRequired: ["RSU", "SSU", "RES"],
	},
	{
		name: "LDE",
		type: "HEAD_MAIN_ONLY",
		abilityChunkTypesRequired: ["ISM", "ISS", "IRU"],
	},
	{
		name: "T",
		type: "HEAD_MAIN_ONLY",
		abilityChunkTypesRequired: ["SCU", "SS", "SPU"],
	},
	{
		name: "CB",
		type: "HEAD_MAIN_ONLY",
		abilityChunkTypesRequired: ["RSU", "SSU", "SCU"],
	},
	{
		name: "NS",
		type: "CLOTHES_MAIN_ONLY",
		abilityChunkTypesRequired: ["IRU", "RSU", "SSU"],
	},
	{
		name: "H",
		type: "CLOTHES_MAIN_ONLY",
		abilityChunkTypesRequired: ["QR", "BRU", "RES"],
	},
	{
		name: "TI",
		type: "CLOTHES_MAIN_ONLY",
		abilityChunkTypesRequired: ["ISM", "ISS", "IA"],
	},
	{
		name: "RP",
		type: "CLOTHES_MAIN_ONLY",
		abilityChunkTypesRequired: ["SS", "QR", "SRU"],
	},
	{ name: "AD", type: "CLOTHES_MAIN_ONLY", abilityChunkTypesRequired: [] },
	{
		name: "SJ",
		type: "SHOES_MAIN_ONLY",
		abilityChunkTypesRequired: ["QSJ", "SRU", "IA"],
	},
	{
		name: "OS",
		type: "SHOES_MAIN_ONLY",
		abilityChunkTypesRequired: ["IRU", "SPU", "BRU"],
	},
	{
		name: "DR",
		type: "SHOES_MAIN_ONLY",
		abilityChunkTypesRequired: ["QSJ", "RES", "IA"],
	},
] as const;

export const abilitiesShort = abilities.map((ability) => ability.name);

export const stackableAbilitiesShort = abilities
	.filter((ability) => ability.type === "STACKABLE")
	.map((ability) => ability.name);

export const mainOnlyAbilitiesShort = abilities
	.filter((ability) => ability.type !== "STACKABLE")
	.map((ability) => ability.name);
