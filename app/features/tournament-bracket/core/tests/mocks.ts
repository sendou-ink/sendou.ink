import {
	checkedInTo,
	expandBracketData,
	testTournamentData,
	tournamentCtxTeam,
} from "./test-utils";

export const PADDLING_POOL_257 = () =>
	testTournamentData({
		data: PADDLING_POOL_257_DATA,
		ctx: {
			isFinalized: 1,
			settings: {
				bracketProgression: [
					{
						name: "Group stage",
						type: "round_robin",
						settings: { teamsPerGroup: 4 },
						requiresCheckIn: false,
					},
					{
						name: "Alpha Bracket",
						type: "single_elimination",
						requiresCheckIn: false,
						settings: {},
						sources: [{ bracketIdx: 0, placements: [1, 2] }],
					},
					{
						name: "Beta Btacket",
						type: "single_elimination",
						requiresCheckIn: false,
						settings: {},
						sources: [{ bracketIdx: 0, placements: [3, 4] }],
					},
				],
			},
			teams: [
				tournamentCtxTeam(892, {
					name: "Le classique à Cam",
					seed: 1,
					checkIns: checkedInTo(1),
				}),
				tournamentCtxTeam(881, {
					name: "New Generation",
					seed: 2,
					checkIns: checkedInTo(1),
				}),
				tournamentCtxTeam(891, {
					name: "Mafia mbappe",
					seed: 3,
					checkIns: checkedInTo(1),
				}),
				tournamentCtxTeam(890, {
					name: "better gaming chair",
					seed: 4,
					checkIns: checkedInTo(1),
				}),
				tournamentCtxTeam(886, {
					name: "Seaya",
					seed: 5,
					checkIns: checkedInTo(1),
				}),
				tournamentCtxTeam(867, {
					name: "NEVER BACK DOWN NEVER WHAT?",
					seed: 6,
					checkIns: checkedInTo(1),
				}),
				tournamentCtxTeam(884, {
					name: "Hazard",
					seed: 7,
					checkIns: checkedInTo(1),
				}),
				tournamentCtxTeam(879, {
					name: "ASC Shokkai ",
					seed: 8,
					checkIns: checkedInTo(1),
				}),
				tournamentCtxTeam(888, {
					name: "Naw, I’d win",
					seed: 9,
					checkIns: checkedInTo(1),
				}),
				tournamentCtxTeam(875, {
					name: "Chippeur arrête de Chipper",
					seed: 10,
					checkIns: checkedInTo(1),
				}),
				tournamentCtxTeam(900, {
					name: "There’s a snake in my boot 🐍",
					seed: 11,
					checkIns: checkedInTo(1),
				}),
				tournamentCtxTeam(828, {
					name: "4Ever",
					seed: 12,
					checkIns: checkedInTo(1),
				}),
				tournamentCtxTeam(871, {
					name: "ASC Niji",
					seed: 13,
					checkIns: checkedInTo(1),
				}),
				tournamentCtxTeam(845, {
					name: "Smoking Moais ",
					seed: 14,
					checkIns: checkedInTo(1),
				}),
				tournamentCtxTeam(878, {
					name: "SAN DIMAS HS FOOTBALL RULES!",
					seed: 15,
					checkIns: checkedInTo(1, 2),
				}),
				tournamentCtxTeam(901, {
					name: "Pickup oder so ig",
					seed: 16,
					checkIns: checkedInTo(1, 2),
				}),
				tournamentCtxTeam(889, {
					name: "DistInkt",
					seed: 17,
					checkIns: checkedInTo(1),
				}),
				tournamentCtxTeam(882, {
					name: "Chaos Control",
					seed: 18,
					checkIns: checkedInTo(1),
				}),
				tournamentCtxTeam(902, {
					name: "Blaze",
					seed: 19,
					checkIns: checkedInTo(1, 2),
				}),
				tournamentCtxTeam(898, {
					name: "Atsub",
					seed: 20,
					checkIns: checkedInTo(1),
				}),
				tournamentCtxTeam(874, {
					name: "Squid Emoji",
					seed: 21,
					checkIns: checkedInTo(1),
				}),
				tournamentCtxTeam(869, {
					name: "Müll🚮",
					seed: 22,
					checkIns: checkedInTo(1),
				}),
				tournamentCtxTeam(843, {
					name: "Rogueport Rascals",
					seed: 23,
					checkIns: checkedInTo(1, 2),
				}),
				tournamentCtxTeam(870, {
					name: "Shade",
					seed: 24,
					checkIns: checkedInTo(1, 2),
				}),
				tournamentCtxTeam(893, {
					name: "Ink Souls Maria",
					seed: 25,
					checkIns: checkedInTo(1, 2),
				}),
				tournamentCtxTeam(883, {
					name: "Second Try",
					seed: 26,
					checkIns: checkedInTo(1, 2),
				}),
				tournamentCtxTeam(839, {
					name: "1HP",
					seed: 27,
					checkIns: checkedInTo(1),
				}),
				tournamentCtxTeam(873, {
					name: "Préférence Pêche ",
					seed: 28,
					checkIns: checkedInTo(1),
				}),
				tournamentCtxTeam(887, {
					name: "AquaSonix",
					seed: 29,
					checkIns: checkedInTo(1),
				}),
				tournamentCtxTeam(897, {
					name: "Splash Mirrors 3",
					seed: 30,
					checkIns: checkedInTo(1, 2),
				}),
				tournamentCtxTeam(872, {
					name: "Intrusive thoughts ",
					seed: 31,
					checkIns: checkedInTo(1),
				}),
				tournamentCtxTeam(819, {
					name: "Heaven sent Lunatics",
					seed: 32,
					checkIns: checkedInTo(1, 2),
				}),
				tournamentCtxTeam(896, {
					name: "<_>Placeholder",
					seed: 33,
					checkIns: checkedInTo(1, 2),
				}),
				tournamentCtxTeam(847, {
					name: "Big Tommy and the Flops",
					seed: 34,
					checkIns: checkedInTo(1),
				}),
				tournamentCtxTeam(838, {
					name: "G Gaming Gaming",
					seed: 35,
					checkIns: checkedInTo(1, 2),
				}),
			],
		},
	});

export const PADDLING_POOL_255 = () =>
	testTournamentData({
		data: PADDLING_POOL_255_DATA,
		ctx: {
			isFinalized: 1,
			settings: {
				bracketProgression: [
					{
						name: "Group stage",
						type: "round_robin",
						settings: {},
						requiresCheckIn: false,
					},
					{
						name: "Final stage",
						type: "single_elimination",
						requiresCheckIn: false,
						settings: {},
						sources: [{ bracketIdx: 0, placements: [1, 2] }],
					},
					{
						name: "Underground bracket",
						type: "single_elimination",
						requiresCheckIn: false,
						settings: {},
						sources: [{ bracketIdx: 0, placements: [3, 4] }],
					},
				],
				teamsPerGroup: 4,
			},
			teams: [
				tournamentCtxTeam(698, {
					name: "Please don't forfeit. ",
					seed: 1,
					checkIns: checkedInTo(1),
				}),
				tournamentCtxTeam(718, {
					name: "Enperries 200p",
					seed: 2,
					checkIns: checkedInTo(1),
				}),
				tournamentCtxTeam(716, {
					name: "allo kayora ?",
					seed: 3,
					checkIns: checkedInTo(1),
				}),
				tournamentCtxTeam(724, {
					name: "menoks!",
					seed: 4,
					checkIns: checkedInTo(1),
				}),
				tournamentCtxTeam(715, {
					name: "Rule them",
					seed: 5,
					checkIns: checkedInTo(1),
				}),
				tournamentCtxTeam(676, {
					name: "NEVER BACK DOWN NEVER WHAT",
					seed: 6,
					checkIns: checkedInTo(1),
				}),
				tournamentCtxTeam(722, {
					name: "iPad jaune",
					seed: 7,
					checkIns: checkedInTo(1),
				}),
				tournamentCtxTeam(708, {
					name: "91 c'est la Champions League",
					seed: 8,
					checkIns: checkedInTo(1),
				}),
				tournamentCtxTeam(701, {
					name: "Hazard",
					seed: 9,
					checkIns: checkedInTo(1),
				}),
				tournamentCtxTeam(709, {
					name: "ASC Shokkai ",
					seed: 10,
					checkIns: checkedInTo(1),
				}),
				tournamentCtxTeam(697, {
					name: "Atlass",
					seed: 11,
					checkIns: checkedInTo(1),
				}),
				tournamentCtxTeam(674, {
					name: "Smoking Moais ",
					seed: 12,
					checkIns: checkedInTo(1),
				}),
				tournamentCtxTeam(677, {
					name: "4Ever",
					seed: 13,
					checkIns: checkedInTo(1),
				}),
				tournamentCtxTeam(713, {
					name: "https://youtu.be/Euq7uTeYCP0?si=",
					seed: 14,
					checkIns: checkedInTo(1),
				}),
				tournamentCtxTeam(719, {
					name: "Gambawaffeln",
					seed: 15,
					checkIns: checkedInTo(1),
				}),
				tournamentCtxTeam(702, {
					name: "ici ça bzzz",
					seed: 16,
					checkIns: checkedInTo(1),
				}),
				tournamentCtxTeam(678, {
					name: "Amoura",
					seed: 17,
					checkIns: checkedInTo(1),
				}),
				tournamentCtxTeam(707, {
					name: "Chaos Control",
					seed: 18,
					checkIns: checkedInTo(1),
				}),
				tournamentCtxTeam(673, {
					name: "Grandma Sicko Mode",
					seed: 19,
					checkIns: checkedInTo(1),
				}),
				tournamentCtxTeam(714, {
					name: "youtube.com/watch?v=dQw4w9WgXcQ",
					seed: 20,
					checkIns: checkedInTo(1, 2),
				}),
				tournamentCtxTeam(672, {
					name: "Müll🚮",
					seed: 21,
					checkIns: checkedInTo(1, 2),
				}),
				tournamentCtxTeam(695, {
					name: "Hisense RL170D4BWE Freestanding ",
					seed: 22,
					checkIns: checkedInTo(1, 2),
				}),
				tournamentCtxTeam(705, {
					name: "Flutter Mane Fanclub",
					seed: 23,
					checkIns: checkedInTo(1),
				}),
				tournamentCtxTeam(720, {
					name: "Blaze",
					seed: 24,
					checkIns: checkedInTo(1),
				}),
				tournamentCtxTeam(721, {
					name: "Squid Emoji",
					seed: 25,
					checkIns: checkedInTo(1),
				}),
				tournamentCtxTeam(706, {
					name: "DistInkt",
					seed: 26,
					checkIns: checkedInTo(1),
				}),
				tournamentCtxTeam(723, {
					name: "We Are Innocent Caterpillars",
					seed: 27,
					checkIns: checkedInTo(1),
				}),
				tournamentCtxTeam(725, {
					name: "Ink Souls Maria",
					seed: 28,
					checkIns: checkedInTo(1, 2),
				}),
				tournamentCtxTeam(675, {
					name: "Yoghurt Party",
					seed: 29,
					checkIns: checkedInTo(1),
				}),
				tournamentCtxTeam(704, {
					name: "Second Try",
					seed: 30,
					checkIns: checkedInTo(1, 2),
				}),
				tournamentCtxTeam(717, {
					name: "ASC Niji~K",
					seed: 31,
					checkIns: checkedInTo(1, 2),
				}),
				tournamentCtxTeam(712, {
					name: "Revenge ",
					seed: 32,
					checkIns: checkedInTo(1),
				}),
				tournamentCtxTeam(699, {
					name: "Stream easy by lesserafim",
					seed: 33,
					checkIns: checkedInTo(1, 2),
				}),
				tournamentCtxTeam(710, {
					name: "Bloody Wave",
					seed: 34,
					checkIns: checkedInTo(1, 2),
				}),
				tournamentCtxTeam(700, {
					name: "Fresh takos ",
					seed: 35,
					checkIns: checkedInTo(1),
				}),
			],
		},
	});

export const IN_THE_ZONE_32 = ({
	undergroundRequiresCheckIn = true,
	hasCheckedOutTeam = false,
}) =>
	testTournamentData({
		data: IN_THE_ZONE_32_DATA,
		ctx: {
			isFinalized: 1,
			settings: {
				bracketProgression: [
					{
						name: "Main bracket",
						type: "double_elimination",
						settings: {},
						requiresCheckIn: false,
					},
					{
						name: "Underground bracket",
						type: "single_elimination",
						requiresCheckIn: undergroundRequiresCheckIn,
						settings: {},
						sources: [{ bracketIdx: 0, placements: [-1, -2] }],
					},
				],
			},
			teams: [
				tournamentCtxTeam(552, { name: "Starburst", seed: 1 }),
				tournamentCtxTeam(548, { name: "Jackpot", seed: 2 }),
				tournamentCtxTeam(499, { name: "Grougrou ", seed: 3 }),
				tournamentCtxTeam(547, { name: "atomic bomb ", seed: 4 }),
				tournamentCtxTeam(507, { name: "Celeste", seed: 5 }),
				tournamentCtxTeam(546, { name: "Moonlight", seed: 6 }),
				tournamentCtxTeam(591, { name: "BEt", seed: 7 }),
				tournamentCtxTeam(592, { name: "As you wish", seed: 8 }),
				tournamentCtxTeam(609, { name: "UK MAFIA", seed: 9 }),
				tournamentCtxTeam(564, { name: "Black Lotus ", seed: 10 }),
				tournamentCtxTeam(590, { name: "ASC Tenshi", seed: 11 }),
				tournamentCtxTeam(595, { name: "Hypernova", seed: 12 }),
				tournamentCtxTeam(601, { name: "Zenith", seed: 13 }),
				tournamentCtxTeam(560, { name: "Yaotl Teotl", seed: 14 }),
				tournamentCtxTeam(594, { name: "FOAMS 34", seed: 15 }),
				tournamentCtxTeam(509, { name: "New Generation ", seed: 16 }),
				tournamentCtxTeam(598, {
					name: "Gen BOB Ten-Piece Chicken Nugget",
					seed: 17,
					checkIns: checkedInTo(1),
				}),
				tournamentCtxTeam(604, { name: "Joga Bonito", seed: 18 }),
				tournamentCtxTeam(603, { name: "JumpingCatapult ", seed: 19 }),
				tournamentCtxTeam(596, { name: "metal pipe", seed: 20 }),
				tournamentCtxTeam(600, {
					name: "Gentlemates",
					seed: 21,
					checkIns: checkedInTo(1),
				}),
				tournamentCtxTeam(500, { name: "Hades", seed: 22, checkIns: [] }),
				tournamentCtxTeam(599, { name: "Hazard", seed: 23 }),
				tournamentCtxTeam(614, {
					name: "Reputation (Taylor's Version)",
					seed: 24,
				}),
				tournamentCtxTeam(610, { name: "Smoking Moais ", seed: 25 }),
				tournamentCtxTeam(551, { name: "Zoneando", seed: 26 }),
				tournamentCtxTeam(597, {
					name: "OVERTIME!!",
					seed: 27,
					checkIns: checkedInTo(1),
				}),
				tournamentCtxTeam(589, { name: "11:11; Make a Wish", seed: 28 }),
				tournamentCtxTeam(612, { name: "delulu ", seed: 29 }),
				tournamentCtxTeam(611, { name: "Replay", seed: 30 }),
				tournamentCtxTeam(606, {
					name: "Peaky P-Key ",
					seed: 31,
					checkIns: checkedInTo(1),
				}),
				tournamentCtxTeam(608, { name: "Hiro le tournevis", seed: 32 }),
				tournamentCtxTeam(605, {
					name: "all my homie hate pencil ",
					seed: 33,
					checkIns: [
						...checkedInTo(),
						...(hasCheckedOutTeam
							? [
									{
										checkedInAt: 1705858841,
										bracketIdx: 1,
										isCheckOut: 1 as const,
									},
								]
							: []),
					],
				}),
				tournamentCtxTeam(593, { name: "Whaa", seed: 34, checkIns: [] }),
			],
		},
	});

const PADDLING_POOL_257_DATA = expandBracketData({
	stage: [
		{
			id: 28,
			name: "Group stage",
			number: 1,
			settings: { groupCount: 9 },
			type: "round_robin",
		},
	],
	group: [
		{ id: 85, number: 1, stageId: 28 },
		{ id: 86, number: 2, stageId: 28 },
		{ id: 87, number: 3, stageId: 28 },
		{ id: 88, number: 4, stageId: 28 },
		{ id: 89, number: 5, stageId: 28 },
		{ id: 90, number: 6, stageId: 28 },
		{ id: 91, number: 7, stageId: 28 },
		{ id: 92, number: 8, stageId: 28 },
		{ id: 93, number: 9, stageId: 28 },
	],
	round: [
		[386, 85, 1, null],
		[387, 85, 2, null],
		[388, 85, 3, null],
		[389, 86, 1, null],
		[390, 86, 2, null],
		[391, 86, 3, null],
		[392, 87, 1, null],
		[393, 87, 2, null],
		[394, 87, 3, null],
		[395, 88, 1, null],
		[396, 88, 2, null],
		[397, 88, 3, null],
		[398, 89, 1, null],
		[399, 89, 2, null],
		[400, 89, 3, null],
		[401, 90, 1, null],
		[402, 90, 2, null],
		[403, 90, 3, null],
		[404, 91, 1, null],
		[405, 91, 2, null],
		[406, 91, 3, null],
		[407, 92, 1, null],
		[408, 92, 2, null],
		[409, 92, 3, null],
		[410, 93, 1, null],
		[411, 93, 2, null],
		[412, 93, 3, null],
	],
	match: {
		386: [
			[1718, [892, 1], null],
			[1719, [902, 19], [882, 18], 1, 2],
		],
		387: [
			[1720, [882, 18], null],
			[1721, [892, 1], [902, 19], 2, 0],
		],
		388: [
			[1722, [902, 19], null],
			[1723, [882, 18], [892, 1], 0, 2],
		],
		389: [
			[1724, [881, 2], [838, 35], 2, 0],
			[1725, [898, 20], [889, 17], 2, 0],
		],
		390: [
			[1726, [889, 17], [838, 35], 2, 1],
			[1727, [881, 2], [898, 20], 2, 0],
		],
		391: [
			[1728, [898, 20], [838, 35], 2, 0],
			[1729, [889, 17], [881, 2], 0, 2],
		],
		392: [
			[1730, [891, 3], [847, 34], 2, 1],
			[1731, [874, 21], [901, 16], 2, 1],
		],
		393: [
			[1732, [901, 16], [847, 34], 2, 0],
			[1733, [891, 3], [874, 21], 2, 0],
		],
		394: [
			[1734, [874, 21], [847, 34], 2, 0],
			[1735, [901, 16], [891, 3], 0, 2],
		],
		395: [
			[1736, [890, 4], [896, 33], 2, 0],
			[1737, [869, 22], [878, 15], 2, 0],
		],
		396: [
			[1738, [878, 15], [896, 33], 2, 0],
			[1739, [890, 4], [869, 22], 2, 0],
		],
		397: [
			[1740, [869, 22], [896, 33], 2, 0],
			[1741, [878, 15], [890, 4], 0, 2],
		],
		398: [
			[1742, [886, 5], [819, 32], 2, 0],
			[1743, [843, 23], [845, 14], 0, 2],
		],
		399: [
			[1744, [845, 14], [819, 32], 2, 0],
			[1745, [886, 5], [843, 23], 2, 0],
		],
		400: [
			[1746, [843, 23], [819, 32], 2, 1],
			[1747, [845, 14], [886, 5], 1, 2],
		],
		401: [
			[1748, [867, 6], [872, 31], 2, 0],
			[1749, [870, 24], [871, 13], 0, 2],
		],
		402: [
			[1750, [871, 13], [872, 31], 2, 0],
			[1751, [867, 6], [870, 24], 2, 0],
		],
		403: [
			[1752, [870, 24], [872, 31], 0, 2],
			[1753, [871, 13], [867, 6], 1, 2],
		],
		404: [
			[1754, [884, 7], [897, 30], 2, 0],
			[1755, [893, 25], [828, 12], 0, 2],
		],
		405: [
			[1756, [828, 12], [897, 30], 2, 0],
			[1757, [884, 7], [893, 25], 2, 0],
		],
		406: [
			[1758, [893, 25], [897, 30], 0, 2],
			[1759, [828, 12], [884, 7], 2, 1],
		],
		407: [
			[1760, [879, 8], [887, 29], 2, 0],
			[1761, [883, 26], [900, 11], 0, 2],
		],
		408: [
			[1762, [900, 11], [887, 29], 2, 0],
			[1763, [879, 8], [883, 26], 2, 0],
		],
		409: [
			[1764, [883, 26], [887, 29], 2, 0],
			[1765, [900, 11], [879, 8], 2, 0],
		],
		410: [
			[1766, [888, 9], [873, 28], 2, 0],
			[1767, [839, 27], [875, 10], 1, 2],
		],
		411: [
			[1768, [875, 10], [873, 28], 2, 0],
			[1769, [888, 9], [839, 27], 2, 0],
		],
		412: [
			[1770, [839, 27], [873, 28], 2, 0],
			[1771, [875, 10], [888, 9], 1, 2],
		],
	},
});

const PADDLING_POOL_255_DATA = expandBracketData({
	stage: [
		{
			id: 20,
			name: "Group stage",
			number: 1,
			settings: { groupCount: 9 },
			type: "round_robin",
			createdAt: 1708538411,
		},
	],
	group: [
		{ id: 56, number: 1, stageId: 20 },
		{ id: 57, number: 2, stageId: 20 },
		{ id: 58, number: 3, stageId: 20 },
		{ id: 59, number: 4, stageId: 20 },
		{ id: 60, number: 5, stageId: 20 },
		{ id: 61, number: 6, stageId: 20 },
		{ id: 62, number: 7, stageId: 20 },
		{ id: 63, number: 8, stageId: 20 },
		{ id: 64, number: 9, stageId: 20 },
	],
	round: [
		[285, 56, 1, null, null],
		[286, 56, 2, null, null],
		[287, 56, 3, null, null],
		[288, 57, 1, null, null],
		[289, 57, 2, null, null],
		[290, 57, 3, null, null],
		[291, 58, 1, null, null],
		[292, 58, 2, null, null],
		[293, 58, 3, null, null],
		[294, 59, 1, null, null],
		[295, 59, 2, null, null],
		[296, 59, 3, null, null],
		[297, 60, 1, null, null],
		[298, 60, 2, null, null],
		[299, 60, 3, null, null],
		[300, 61, 1, null, null],
		[301, 61, 2, null, null],
		[302, 61, 3, null, null],
		[303, 62, 1, null, null],
		[304, 62, 2, null, null],
		[305, 62, 3, null, null],
		[306, 63, 1, null, null],
		[307, 63, 2, null, null],
		[308, 63, 3, null, null],
		[309, 64, 1, null, null],
		[310, 64, 2, null, null],
		[311, 64, 3, null, null],
	],
	match: {
		285: [
			[1426, [698, 1], null],
			[1427, [673, 19], [707, 18], 2, 0],
		],
		286: [
			[1428, [707, 18], null],
			[1429, [698, 1], [673, 19], 2, 0],
		],
		287: [
			[1430, [673, 19], null],
			[1431, [707, 18], [698, 1], 0, 2],
		],
		288: [
			[1432, [718, 2], [700, 35], 2, 0],
			[1433, [714, 20], [678, 17], 1, 2],
		],
		289: [
			[1434, [678, 17], [700, 35], 2, 0],
			[1435, [718, 2], [714, 20], 2, 0],
		],
		290: [
			[1436, [714, 20], [700, 35], 2, 0],
			[1437, [678, 17], [718, 2], 0, 2],
		],
		291: [
			[1438, [716, 3], [710, 34], 2, 0],
			[1439, [672, 21], [702, 16], 0, 2],
		],
		292: [
			[1440, [702, 16], [710, 34], 2, 0],
			[1441, [716, 3], [672, 21], 2, 0],
		],
		293: [
			[1442, [672, 21], [710, 34], 2, 0],
			[1443, [702, 16], [716, 3], 0, 2],
		],
		294: [
			[1444, [724, 4], [699, 33], 2, 0],
			[1445, [695, 22], [719, 15], 0, 2],
		],
		295: [
			[1446, [719, 15], [699, 33], 2, 0],
			[1447, [724, 4], [695, 22], 2, 0],
		],
		296: [
			[1448, [695, 22], [699, 33], 2, 0],
			[1449, [719, 15], [724, 4], 1, 2],
		],
		297: [
			[1450, [715, 5], [712, 32], 2, 0],
			[1451, [705, 23], [713, 14], 0, 2],
		],
		298: [
			[1452, [713, 14], [712, 32], 2, 0],
			[1453, [715, 5], [705, 23], 2, 0],
		],
		299: [
			[1454, [705, 23], [712, 32], 2, 0],
			[1455, [713, 14], [715, 5], 2, 1],
		],
		300: [
			[1456, [676, 6], [717, 31], 2, 0],
			[1457, [720, 24], [677, 13], 0, 2],
		],
		301: [
			[1458, [677, 13], [717, 31], 2, 0],
			[1459, [676, 6], [720, 24], 1, 2],
		],
		302: [
			[1460, [720, 24], [717, 31], 2, 0],
			[1461, [677, 13], [676, 6], 2, 1],
		],
		303: [
			[1462, [722, 7], [704, 30], 2, 0],
			[1463, [721, 25], [674, 12], 0, 2],
		],
		304: [
			[1464, [674, 12], [704, 30], 2, 0],
			[1465, [722, 7], [721, 25], 2, 0],
		],
		305: [
			[1466, [721, 25], [704, 30], 1, 2],
			[1467, [674, 12], [722, 7], 0, 2],
		],
		306: [
			[1468, [708, 8], [675, 29], 2, 0],
			[1469, [706, 26], [697, 11], 0, 2],
		],
		307: [
			[1470, [697, 11], [675, 29], 2, 0],
			[1471, [708, 8], [706, 26], 1, 2],
		],
		308: [
			[1472, [706, 26], [675, 29], 2, 1],
			[1473, [697, 11], [708, 8], 2, 0],
		],
		309: [
			[1474, [701, 9], [725, 28], 2, 1],
			[1475, [723, 27], [709, 10], 0, 2],
		],
		310: [
			[1476, [709, 10], [725, 28], 2, 0],
			[1477, [701, 9], [723, 27], 2, 0],
		],
		311: [
			[1478, [723, 27], [725, 28], 1, 2],
			[1479, [709, 10], [701, 9], 2, 0],
		],
	},
});

const IN_THE_ZONE_32_DATA = expandBracketData({
	stage: [
		{
			id: 16,
			name: "Main bracket",
			number: 1,
			settings: {},
			type: "double_elimination",
		},
	],
	group: [{ id: 46, number: 1, stageId: 16 }],
	round: [
		[238, 46, 1, "winners"],
		[239, 46, 2, "winners"],
		[240, 46, 3, "winners"],
		[241, 46, 4, "winners"],
		[242, 46, 5, "winners"],
		[243, 46, 1, "losers"],
		[244, 46, 2, "losers"],
		[245, 46, 3, "losers"],
		[246, 46, 4, "losers"],
		[247, 46, 5, "losers"],
		[248, 46, 6, "losers"],
		[249, 46, 7, "losers"],
		[250, 46, 8, "losers"],
		[251, 46, 1, "finals"],
		[252, 46, 2, "finals"],
	],
	match: {
		238: [
			[1234, [552, 1], [605, 32], 2, 0],
			[1235, [509, 16], [598, 17], 2, 1],
			[1236, [592, 8], [551, 25], 2, 0],
			[1237, [609, 9], [610, 24], 2, 0],
			[1238, [547, 4], [611, 29], 2, 0],
			[1239, [601, 13], [596, 20], 1, 2],
			[1240, [507, 5], [612, 28], 2, 0],
			[1241, [595, 12], [600, 21], 2, 0],
			[1242, [548, 2], [608, 31], 2, 0],
			[1243, [594, 15], [604, 18], 2, 1],
			[1244, [591, 7], [597, 26], 2, 0],
			[1245, [564, 10], [614, 23], 2, 0],
			[1246, [499, 3], [606, 30], 2, 0],
			[1247, [560, 14], [603, 19], 1, 2],
			[1248, [546, 6], [589, 27], 2, 0],
			[1249, [590, 11], [599, 22], 2, 0],
		],
		239: [
			[1250, 552, 509, 2, 1],
			[1251, 592, 609, 2, 1],
			[1252, 547, 596, 2, 1],
			[1253, 507, 595, 2, 0],
			[1254, 548, 594, 2, 0],
			[1255, 591, 564, 1, 2],
			[1256, 499, 603, 2, 0],
			[1257, 546, 590, 2, 1],
		],
		240: [
			[1258, 552, 592, 3, 0],
			[1259, 547, 507, 3, 0],
			[1260, 548, 564, 3, 1],
			[1261, 499, 546, 3, 1],
		],
		241: [
			[1262, 552, 547, 3, 1],
			[1263, 548, 499, 3, 1],
		],
		242: [[1264, 552, 548, 1, 3]],
		243: [
			[1265, [605, 1], [598, 2], 0, 2],
			[1266, [551, 3], [610, 4], 1, 2],
			[1267, [611, 5], [601, 6], 1, 2],
			[1268, [612, 7], [600, 8], 1, 2],
			[1269, [608, 9], [604, 10], 2, 0],
			[1270, [597, 11], [614, 12], 2, 0],
			[1271, [606, 13], [560, 14], 0, 2],
			[1272, [589, 15], [599, 16], 2, 1],
		],
		244: [
			[1273, [590, 8], 598, 2, 1],
			[1274, [603, 7], 610, 2, 0],
			[1275, [591, 6], 601, 2, 0],
			[1276, [594, 5], 600, 2, 0],
			[1277, [595, 4], 608, 2, 0],
			[1278, [596, 3], 597, 2, 0],
			[1279, [609, 2], 560, 2, 1],
			[1280, [509, 1], 589, 2, 0],
		],
		245: [
			[1281, 590, 603, 2, 0],
			[1282, 591, 594, 2, 1],
			[1283, 595, 596, 1, 2],
			[1284, 609, 509, 0, 2],
		],
		246: [
			[1285, [564, 3], 590, 2, 0],
			[1286, [546, 4], 591, 2, 0],
			[1287, [592, 1], 596, 2, 0],
			[1288, [507, 2], 509, 0, 2],
		],
		247: [
			[1289, 564, 546, 2, 0],
			[1290, 592, 509, 2, 1],
		],
		248: [
			[1291, [547, 1], 564, 2, 0],
			[1292, [499, 2], 592, 2, 1],
		],
		249: [[1293, 547, 499, 2, 1]],
		250: [[1294, [552, 1], 547, 3, 1]],
		251: [[1295, 548, [552, 1], 3, 2]],
		252: [[1296, 548, 552]],
	},
});
