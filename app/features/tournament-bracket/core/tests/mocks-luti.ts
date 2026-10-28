import {
	expandBracketData,
	roundMaps,
	testTournament,
	tournamentCtxTeam,
} from "./test-utils";

/** LUTI Season 16 Division 1 with groups finished but play-offs not started */
export const LUTI_S16_DIV_1 = () =>
	testTournament({
		data: DATA,
		ctx: {
			settings: {
				bracketProgression: [
					{
						type: "round_robin",
						name: "Group Stage",
						settings: { teamsPerGroup: 6 },
						requiresCheckIn: false,
					},
					{
						type: "single_elimination",
						name: "Playoffs",
						settings: {},
						requiresCheckIn: false,
						sources: [{ bracketIdx: 0, placements: [1, 2] }],
					},
				],
			},
			teams: [
				tournamentCtxTeam(25237, { name: "Lego Fortnite #4NICK", seed: 1 }),
				tournamentCtxTeam(25238, { name: "Hades", seed: 2 }),
				tournamentCtxTeam(25239, { name: "0079", seed: 3 }),
				tournamentCtxTeam(25240, { name: "Regular show", seed: 4 }),
				tournamentCtxTeam(25241, { name: "Ball up top³", seed: 5 }),
				tournamentCtxTeam(25242, { name: "Cherry Wave", seed: 6 }),
				tournamentCtxTeam(25243, { name: "ASC Ryu", seed: 7 }),
				tournamentCtxTeam(25244, { name: "bonsai!", seed: 8 }),
				tournamentCtxTeam(25245, { name: "Octoπ", seed: 9 }),
				tournamentCtxTeam(25246, { name: "Ink Souls Maria", seed: 10 }),
				tournamentCtxTeam(25247, { name: "Poseidon", seed: 11 }),
				tournamentCtxTeam(25248, { name: "Yaotl Teotl", seed: 12 }),
				tournamentCtxTeam(25249, { name: "Serotonin", seed: 13 }),
				tournamentCtxTeam(25250, { name: "JBLAST!!!!", seed: 14 }),
				tournamentCtxTeam(25251, { name: "3 Point Divers", seed: 15 }),
				tournamentCtxTeam(25252, {
					name: "FOAMS Forever After -- DROPPED",
					seed: 16,
				}),
				tournamentCtxTeam(25253, { name: "Lunchbox!", seed: 17 }),
				tournamentCtxTeam(25254, { name: "Myopsidus", seed: 18 }),
				tournamentCtxTeam(25255, { name: "BlankZ", seed: 19 }),
				tournamentCtxTeam(25256, { name: "Daycare", seed: 20 }),
				tournamentCtxTeam(25257, { name: "Seapunks!", seed: 21 }),
				tournamentCtxTeam(25258, { name: "Nawal", seed: 22 }),
				tournamentCtxTeam(25259, { name: "Symphony", seed: 23 }),
				tournamentCtxTeam(25260, { name: "Buldak Warriors ^-^", seed: 24 }),
			],
		},
	});

const DATA = expandBracketData({
	stage: [
		{
			id: 2049,
			name: "Group Stage",
			number: 1,
			settings: { groupCount: 4 },
			type: "round_robin",
			createdAt: 1741045995,
		},
	],
	group: [
		{ id: 6149, number: 1, stageId: 2049 },
		{ id: 6150, number: 2, stageId: 2049 },
		{ id: 6151, number: 3, stageId: 2049 },
		{ id: 6152, number: 4, stageId: 2049 },
	],
	round: [
		[18827, 6149, 1, null, roundMaps.bestOf9],
		[18828, 6149, 2, null, roundMaps.bestOf9],
		[18829, 6149, 3, null, roundMaps.bestOf9],
		[18830, 6149, 4, null, roundMaps.bestOf9],
		[18831, 6149, 5, null, roundMaps.bestOf9],
		[18832, 6150, 1, null, roundMaps.bestOf9],
		[18833, 6150, 2, null, roundMaps.bestOf9],
		[18834, 6150, 3, null, roundMaps.bestOf9],
		[18835, 6150, 4, null, roundMaps.bestOf9],
		[18836, 6150, 5, null, roundMaps.bestOf9],
		[18837, 6151, 1, null, roundMaps.bestOf9],
		[18838, 6151, 2, null, roundMaps.bestOf9],
		[18839, 6151, 3, null, roundMaps.bestOf9],
		[18840, 6151, 4, null, roundMaps.bestOf9],
		[18841, 6151, 5, null, roundMaps.bestOf9],
		[18842, 6152, 1, null, roundMaps.bestOf9],
		[18843, 6152, 2, null, roundMaps.bestOf9],
		[18844, 6152, 3, null, roundMaps.bestOf9],
		[18845, 6152, 4, null, roundMaps.bestOf9],
		[18846, 6152, 5, null, roundMaps.bestOf9],
	],
	match: {
		18827: [
			[51931, [25237, 1], [25260, 24], 5, 2],
			[51932, [25253, 17], [25244, 8], 5, 0],
			[51933, [25252, 16], [25245, 9], 0, 5],
		],
		18828: [
			[51934, [25244, 8], [25260, 24], 1, 5],
			[51935, [25237, 1], [25245, 9], 3, 5],
			[51936, [25253, 17], [25252, 16], 5, 0],
		],
		18829: [
			[51937, [25245, 9], [25260, 24], 1, 5],
			[51938, [25244, 8], [25252, 16], 5, 3],
			[51939, [25237, 1], [25253, 17], 5, 0],
		],
		18830: [
			[51940, [25252, 16], [25260, 24], 3, 5],
			[51941, [25245, 9], [25253, 17], 5, 4],
			[51942, [25244, 8], [25237, 1], 2, 5],
		],
		18831: [
			[51943, [25253, 17], [25260, 24], 1, 5],
			[51944, [25252, 16], [25237, 1], 0, 5],
			[51945, [25245, 9], [25244, 8], 5, 1],
		],
		18832: [
			[51946, [25238, 2], [25259, 23], 1, 5],
			[51947, [25254, 18], [25243, 7], 1, 5],
			[51948, [25251, 15], [25246, 10], 5, 0],
		],
		18833: [
			[51949, [25243, 7], [25259, 23], 2, 5],
			[51950, [25238, 2], [25246, 10], 0, 5],
			[51951, [25254, 18], [25251, 15], 5, 1],
		],
		18834: [
			[51952, [25246, 10], [25259, 23], 1, 5],
			[51953, [25243, 7], [25251, 15], 5, 4],
			[51954, [25238, 2], [25254, 18], 0, 5],
		],
		18835: [
			[51955, [25251, 15], [25259, 23], 5, 0],
			[51956, [25246, 10], [25254, 18], 1, 5],
			[51957, [25243, 7], [25238, 2], 5, 0],
		],
		18836: [
			[51958, [25254, 18], [25259, 23], 5, 0],
			[51959, [25251, 15], [25238, 2], 5, 0],
			[51960, [25246, 10], [25243, 7], 0, 5],
		],
		18837: [
			[51961, [25239, 3], [25258, 22], 5, 2],
			[51962, [25255, 19], [25242, 6], 4, 5],
			[51963, [25250, 14], [25247, 11], 5, 0],
		],
		18838: [
			[51964, [25242, 6], [25258, 22], 5, 0],
			[51965, [25239, 3], [25247, 11], 2, 5],
			[51966, [25255, 19], [25250, 14], 2, 5],
		],
		18839: [
			[51967, [25247, 11], [25258, 22], 4, 5],
			[51968, [25242, 6], [25250, 14], 2, 5],
			[51969, [25239, 3], [25255, 19], 0, 5],
		],
		18840: [
			[51970, [25250, 14], [25258, 22], 5, 0],
			[51971, [25247, 11], [25255, 19], 5, 4],
			[51972, [25242, 6], [25239, 3], 5, 0],
		],
		18841: [
			[51973, [25255, 19], [25258, 22], 1, 5],
			[51974, [25250, 14], [25239, 3], 5, 0],
			[51975, [25247, 11], [25242, 6], 5, 3],
		],
		18842: [
			[51976, [25240, 4], [25257, 21], 5, 0],
			[51977, [25256, 20], [25241, 5], 5, 1],
			[51978, [25249, 13], [25248, 12], 5, 3],
		],
		18843: [
			[51979, [25241, 5], [25257, 21], 5, 2],
			[51980, [25240, 4], [25248, 12], 5, 2],
			[51981, [25256, 20], [25249, 13], 2, 5],
		],
		18844: [
			[51982, [25248, 12], [25257, 21], 3, 5],
			[51983, [25241, 5], [25249, 13], 4, 5],
			[51984, [25240, 4], [25256, 20], 5, 2],
		],
		18845: [
			[51985, [25249, 13], [25257, 21], 5, 2],
			[51986, [25248, 12], [25256, 20], 5, 0],
			[51987, [25241, 5], [25240, 4], 4, 5],
		],
		18846: [
			[51988, [25256, 20], [25257, 21], 5, 0],
			[51989, [25249, 13], [25240, 4], 0, 5],
			[51990, [25248, 12], [25241, 5], 5, 1],
		],
	},
});
