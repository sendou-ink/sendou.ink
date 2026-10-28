import type { TournamentData } from "../Tournament.server";
import {
	checkedInTo,
	expandBracketData,
	roundMaps,
	testTournamentData,
	tournamentCtxTeam,
} from "./test-utils";

/** Swim or Sink with groups finished but none of the follow-up brackets started */
export const SWIM_OR_SINK_167 = (
	overrides: TournamentData["ctx"]["bracketProgressionOverrides"] = [],
) =>
	testTournamentData({
		data: DATA,
		ctx: {
			bracketProgressionOverrides: overrides,
			settings: {
				bracketProgression: [
					{
						name: "Group stage",
						type: "round_robin",
						requiresCheckIn: false,
						settings: { teamsPerGroup: 4 },
					},
					{
						name: "Great White",
						type: "single_elimination",
						requiresCheckIn: false,
						settings: {},
						sources: [{ bracketIdx: 0, placements: [1] }],
					},
					{
						name: "Hammerhead",
						type: "single_elimination",
						requiresCheckIn: false,
						settings: {},
						sources: [{ bracketIdx: 0, placements: [2] }],
					},
					{
						name: "Mako",
						type: "single_elimination",
						requiresCheckIn: false,
						settings: {},
						sources: [{ bracketIdx: 0, placements: [3] }],
					},
					{
						name: "Lantern",
						type: "single_elimination",
						requiresCheckIn: false,
						settings: {},
						sources: [{ bracketIdx: 0, placements: [4] }],
					},
				],
				teamsPerGroup: 4,
				thirdPlaceMatch: true,
			},
			teams: [
				tournamentCtxTeam(14657, {
					name: "SOS WARRIORS",
					seed: 1,
					checkIns: checkedInTo(1, 2, 3, 4),
				}),
				tournamentCtxTeam(14800, {
					name: "/rw3",
					seed: 2,
					checkIns: checkedInTo(1, 2, 3, 4),
				}),
				tournamentCtxTeam(14743, {
					name: "Honkai",
					seed: 3,
					checkIns: checkedInTo(1, 2, 3, 4),
				}),
				tournamentCtxTeam(14801, {
					name: "🦌",
					seed: 4,
					checkIns: checkedInTo(1, 2, 3, 4),
				}),
				tournamentCtxTeam(14792, {
					name: "cutie patooties",
					seed: 5,
					checkIns: checkedInTo(1, 2, 3, 4),
				}),
				tournamentCtxTeam(14670, {
					name: "Triggerfish Zones Supremacy",
					seed: 6,
					checkIns: checkedInTo(1, 2, 3, 4),
				}),
				tournamentCtxTeam(14661, {
					name: "Retro Records",
					seed: 7,
					checkIns: checkedInTo(1, 2, 3, 4),
				}),
				tournamentCtxTeam(14804, {
					name: "Impulse",
					seed: 8,
					checkIns: checkedInTo(1, 2, 3, 4),
				}),
				tournamentCtxTeam(14732, {
					name: "Wave breaker",
					seed: 9,
					checkIns: checkedInTo(1, 2, 3, 4),
				}),
				tournamentCtxTeam(14747, {
					name: "FreeFlow",
					seed: 10,
					checkIns: checkedInTo(1, 2, 4),
				}),
				tournamentCtxTeam(14748, {
					name: "Poisonous Gas Balloon",
					seed: 11,
					checkIns: checkedInTo(1, 2, 3, 4),
				}),
				tournamentCtxTeam(14803, {
					name: "😺",
					seed: 12,
					checkIns: checkedInTo(1, 2, 3, 4),
				}),
				tournamentCtxTeam(14795, {
					name: "petrichor.",
					seed: 13,
					checkIns: checkedInTo(1, 2, 3, 4),
				}),
				tournamentCtxTeam(14445, {
					name: "New Wave",
					seed: 14,
					checkIns: checkedInTo(1, 2, 3, 4),
				}),
				tournamentCtxTeam(14810, {
					name: "Roblox Fishermen",
					seed: 15,
					checkIns: [],
				}),
				tournamentCtxTeam(14777, {
					name: "2 chicken quesadillas",
					seed: 16,
					checkIns: checkedInTo(1, 2, 3, 4),
				}),
				tournamentCtxTeam(14805, {
					name: "REBOUND",
					seed: 17,
					checkIns: checkedInTo(1, 2, 3, 4),
				}),
				tournamentCtxTeam(14806, {
					name: "hey wanna see something cool",
					seed: 18,
					checkIns: checkedInTo(1, 2, 3, 4),
				}),
				tournamentCtxTeam(14653, {
					name: "Sweet Espresso",
					seed: 19,
					checkIns: checkedInTo(1, 2, 3, 4),
				}),
				tournamentCtxTeam(14708, {
					name: "Outcast",
					seed: 20,
					checkIns: checkedInTo(1, 2, 3, 4),
				}),
				tournamentCtxTeam(14715, {
					name: "Memento Moray",
					seed: 21,
					checkIns: checkedInTo(1, 2, 3, 4),
				}),
				tournamentCtxTeam(14796, {
					name: "moi et la gothique",
					seed: 22,
					checkIns: checkedInTo(1, 2, 3, 4),
				}),
				tournamentCtxTeam(14797, {
					name: "the fire worms are back",
					seed: 23,
					checkIns: checkedInTo(1, 2, 3, 4),
				}),
				tournamentCtxTeam(14750, {
					name: "Meow's the Chance",
					seed: 24,
					checkIns: [],
				}),
				tournamentCtxTeam(14809, {
					name: "Shellfire",
					seed: 25,
					checkIns: checkedInTo(1, 2, 3, 4),
				}),
				tournamentCtxTeam(14709, {
					name: "Eepy Dreepy",
					seed: 26,
					checkIns: checkedInTo(1, 2, 3, 4),
				}),
				tournamentCtxTeam(14783, {
					name: "Blitz Wave",
					seed: 27,
					checkIns: [],
				}),
				tournamentCtxTeam(14702, {
					name: "YT->MP3",
					seed: 28,
					checkIns: checkedInTo(1, 2, 3, 4),
				}),
				tournamentCtxTeam(14735, {
					name: "Wavelength",
					seed: 29,
					checkIns: checkedInTo(1, 2, 3, 4),
				}),
				tournamentCtxTeam(14798, {
					name: "fearless I think",
					seed: 30,
					checkIns: checkedInTo(1, 2, 3, 4),
				}),
				tournamentCtxTeam(14663, {
					name: "Los Inklings",
					seed: 31,
					checkIns: checkedInTo(1, 2, 3, 4),
				}),
				tournamentCtxTeam(14517, {
					name: "High Point",
					seed: 32,
					checkIns: checkedInTo(1, 2, 3, 4),
				}),
				tournamentCtxTeam(14741, {
					name: "Magic Beans",
					seed: 33,
					checkIns: checkedInTo(1, 2, 3, 4),
				}),
				tournamentCtxTeam(14711, {
					name: "Sonora Inkamita de Iztapalapa",
					seed: 34,
					checkIns: [],
				}),
				tournamentCtxTeam(14655, {
					name: "Squid Rollups",
					seed: 35,
					checkIns: checkedInTo(1, 2, 3, 4),
				}),
				tournamentCtxTeam(14634, {
					name: "Strawberry Supernova",
					seed: 36,
					checkIns: [],
				}),
				tournamentCtxTeam(14799, {
					name: "Moonshine",
					seed: 37,
					checkIns: checkedInTo(1, 2, 3, 4),
				}),
				tournamentCtxTeam(14784, { name: "SSSoda!!!", seed: 38, checkIns: [] }),
				tournamentCtxTeam(14733, {
					name: "Lock out",
					seed: 39,
					checkIns: checkedInTo(1, 2, 3, 4),
				}),
				tournamentCtxTeam(14611, {
					name: "Distortion",
					seed: 40,
					checkIns: [],
				}),
				tournamentCtxTeam(14713, {
					name: "California girls",
					seed: 41,
					checkIns: checkedInTo(1, 2, 3, 4),
				}),
				tournamentCtxTeam(14687, {
					name: "Anenemies",
					seed: 42,
					checkIns: checkedInTo(1, 2, 3, 4),
				}),
				tournamentCtxTeam(14742, {
					name: "Overdive",
					seed: 43,
					checkIns: checkedInTo(1, 2, 3, 4),
				}),
				tournamentCtxTeam(14764, {
					name: "The Coastal Service",
					seed: 44,
					checkIns: checkedInTo(1, 2, 3, 4),
				}),
				tournamentCtxTeam(14802, {
					name: "Fanshawe Fuel",
					seed: 45,
					checkIns: checkedInTo(1, 2, 3, 4),
				}),
				tournamentCtxTeam(14696, {
					name: "Loud Noises",
					seed: 46,
					checkIns: checkedInTo(1, 2, 3, 4),
				}),
				tournamentCtxTeam(14808, {
					name: "Yarg",
					seed: 47,
					checkIns: checkedInTo(1, 2, 3, 4),
				}),
				tournamentCtxTeam(14620, {
					name: "HP OfficeJet All-In-One Printer",
					seed: 48,
					checkIns: checkedInTo(1, 2, 3, 4),
				}),
				tournamentCtxTeam(14737, {
					name: "C-Dragons",
					seed: 49,
					checkIns: checkedInTo(1, 2, 3, 4),
				}),
				tournamentCtxTeam(14503, {
					name: "United Crushers",
					seed: 50,
					checkIns: [],
				}),
				tournamentCtxTeam(14739, {
					name: "Hal Laboratory Dog Eggs",
					seed: 51,
					checkIns: checkedInTo(1, 2, 3, 4),
				}),
				tournamentCtxTeam(14607, {
					name: "Ultra Kraken",
					seed: 52,
					checkIns: checkedInTo(1, 2, 3, 4),
				}),
			],
		},
	});

const DATA = expandBracketData({
	stage: [
		{
			id: 1118,
			name: "Group stage",
			number: 1,
			settings: { groupCount: 11 },
			type: "round_robin",
			createdAt: 1730941256,
		},
	],
	group: [
		{ id: 3508, number: 1, stageId: 1118 },
		{ id: 3509, number: 2, stageId: 1118 },
		{ id: 3510, number: 3, stageId: 1118 },
		{ id: 3511, number: 4, stageId: 1118 },
		{ id: 3512, number: 5, stageId: 1118 },
		{ id: 3513, number: 6, stageId: 1118 },
		{ id: 3514, number: 7, stageId: 1118 },
		{ id: 3515, number: 8, stageId: 1118 },
		{ id: 3516, number: 9, stageId: 1118 },
		{ id: 3517, number: 10, stageId: 1118 },
		{ id: 3518, number: 11, stageId: 1118 },
	],
	round: [
		[10930, 3508, 1, null, roundMaps.bestOf3],
		[10931, 3508, 2, null, roundMaps.bestOf3],
		[10932, 3508, 3, null, roundMaps.bestOf3],
		[10933, 3509, 1, null, roundMaps.bestOf3],
		[10934, 3509, 2, null, roundMaps.bestOf3],
		[10935, 3509, 3, null, roundMaps.bestOf3],
		[10936, 3510, 1, null, roundMaps.bestOf3],
		[10937, 3510, 2, null, roundMaps.bestOf3],
		[10938, 3510, 3, null, roundMaps.bestOf3],
		[10939, 3511, 1, null, roundMaps.bestOf3],
		[10940, 3511, 2, null, roundMaps.bestOf3],
		[10941, 3511, 3, null, roundMaps.bestOf3],
		[10942, 3512, 1, null, roundMaps.bestOf3],
		[10943, 3512, 2, null, roundMaps.bestOf3],
		[10944, 3512, 3, null, roundMaps.bestOf3],
		[10945, 3513, 1, null, roundMaps.bestOf3],
		[10946, 3513, 2, null, roundMaps.bestOf3],
		[10947, 3513, 3, null, roundMaps.bestOf3],
		[10948, 3514, 1, null, roundMaps.bestOf3],
		[10949, 3514, 2, null, roundMaps.bestOf3],
		[10950, 3514, 3, null, roundMaps.bestOf3],
		[10951, 3515, 1, null, roundMaps.bestOf3],
		[10952, 3515, 2, null, roundMaps.bestOf3],
		[10953, 3515, 3, null, roundMaps.bestOf3],
		[10954, 3516, 1, null, roundMaps.bestOf3],
		[10955, 3516, 2, null, roundMaps.bestOf3],
		[10956, 3516, 3, null, roundMaps.bestOf3],
		[10957, 3517, 1, null, roundMaps.bestOf3],
		[10958, 3517, 2, null, roundMaps.bestOf3],
		[10959, 3517, 3, null, roundMaps.bestOf3],
		[10960, 3518, 1, null, roundMaps.bestOf3],
		[10961, 3518, 2, null, roundMaps.bestOf3],
		[10962, 3518, 3, null, roundMaps.bestOf3],
	],
	match: {
		10930: [
			[31409, [14657, 1], [14607, 44], 2, 0],
			[31410, [14809, 23], [14797, 22], 2, 0],
		],
		10931: [
			[31411, [14797, 22], [14607, 44], 2, 0],
			[31412, [14657, 1], [14809, 23], 2, 0],
		],
		10932: [
			[31413, [14809, 23], [14607, 44], 2, 0],
			[31414, [14797, 22], [14657, 1], 0, 2],
		],
		10933: [
			[31415, [14800, 2], [14739, 43], 2, 0],
			[31416, [14709, 24], [14796, 21], 2, 0],
		],
		10934: [
			[31417, [14796, 21], [14739, 43], 2, 0],
			[31418, [14800, 2], [14709, 24], 2, 1],
		],
		10935: [
			[31419, [14709, 24], [14739, 43], 2, 1],
			[31420, [14796, 21], [14800, 2], 0, 2],
		],
		10936: [
			[31421, [14743, 3], [14737, 42], 2, 0],
			[31422, [14702, 25], [14715, 20], 1, 2],
		],
		10937: [
			[31423, [14715, 20], [14737, 42], 2, 0],
			[31424, [14743, 3], [14702, 25], 2, 0],
		],
		10938: [
			[31425, [14702, 25], [14737, 42], 2, 0],
			[31426, [14715, 20], [14743, 3], 0, 2],
		],
		10939: [
			[31427, [14801, 4], [14620, 41], 2, 0],
			[31428, [14735, 26], [14708, 19], 2, 0],
		],
		10940: [
			[31429, [14708, 19], [14620, 41], 2, 0],
			[31430, [14801, 4], [14735, 26], 2, 0],
		],
		10941: [
			[31431, [14735, 26], [14620, 41], 2, 0],
			[31432, [14708, 19], [14801, 4], 0, 2],
		],
		10942: [
			[31433, [14792, 5], [14808, 40], 2, 0],
			[31434, [14798, 27], [14653, 18], 0, 2],
		],
		10943: [
			[31435, [14653, 18], [14808, 40], 2, 0],
			[31436, [14792, 5], [14798, 27], 2, 0],
		],
		10944: [
			[31437, [14798, 27], [14808, 40], 2, 1],
			[31438, [14653, 18], [14792, 5], 0, 2],
		],
		10945: [
			[31439, [14670, 6], [14696, 39], 2, 0],
			[31440, [14663, 28], [14806, 17], 1, 2],
		],
		10946: [
			[31441, [14806, 17], [14696, 39], 2, 0],
			[31442, [14670, 6], [14663, 28], 2, 0],
		],
		10947: [
			[31443, [14663, 28], [14696, 39], 2, 0],
			[31444, [14806, 17], [14670, 6], 0, 2],
		],
		10948: [
			[31445, [14661, 7], [14802, 38], 2, 0],
			[31446, [14517, 29], [14805, 16], 1, 2],
		],
		10949: [
			[31447, [14805, 16], [14802, 38], 2, 1],
			[31448, [14661, 7], [14517, 29], 2, 0],
		],
		10950: [
			[31449, [14517, 29], [14802, 38], 2, 0],
			[31450, [14805, 16], [14661, 7], 0, 2],
		],
		10951: [
			[31451, [14804, 8], [14764, 37], 2, 0],
			[31452, [14741, 30], [14777, 15], 0, 2],
		],
		10952: [
			[31453, [14777, 15], [14764, 37], 2, 0],
			[31454, [14804, 8], [14741, 30], 2, 0],
		],
		10953: [
			[31455, [14741, 30], [14764, 37], 2, 0],
			[31456, [14777, 15], [14804, 8], 2, 0],
		],
		10954: [
			[31457, [14732, 9], [14742, 36], 2, 0],
			[31458, [14655, 31], [14445, 14], 0, 2],
		],
		10955: [
			[31459, [14445, 14], [14742, 36], 2, 0],
			[31460, [14732, 9], [14655, 31], 2, 0],
		],
		10956: [
			[31461, [14655, 31], [14742, 36], 0, 2],
			[31462, [14445, 14], [14732, 9], 0, 2],
		],
		10957: [
			[31463, [14747, 10], [14687, 35], 2, 0],
			[31464, [14799, 32], [14795, 13], 1, 2],
		],
		10958: [
			[31465, [14795, 13], [14687, 35], 2, 0],
			[31466, [14747, 10], [14799, 32], 1, 2],
		],
		10959: [
			[31467, [14799, 32], [14687, 35], 2, 0],
			[31468, [14795, 13], [14747, 10], 2, 1],
		],
		10960: [
			[31469, [14748, 11], [14713, 34], 2, 0],
			[31470, [14733, 33], [14803, 12], 0, 2],
		],
		10961: [
			[31471, [14803, 12], [14713, 34], 2, 0],
			[31472, [14748, 11], [14733, 33], 2, 0],
		],
		10962: [
			[31473, [14733, 33], [14713, 34], 2, 0],
			[31474, [14803, 12], [14748, 11], 2, 0],
		],
	},
});
