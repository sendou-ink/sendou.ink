import {
	expandBracketData,
	roundMaps,
	testTournamentData,
	tournamentCtxTeam,
} from "./test-utils";

/** Zones Weekly 38 with every round of swiss finished, last round's matches not generated */
export const ZONES_WEEKLY_38 = () =>
	testTournamentData({
		data: DATA,
		ctx: {
			settings: {
				bracketProgression: [
					{
						type: "swiss",
						name: "Main Bracket",
						settings: { roundCount: 4 },
						requiresCheckIn: false,
					},
				],
			},
			teams: [
				tournamentCtxTeam(18248, { name: "Bamboo Pirates", seed: 1 }),
				tournamentCtxTeam(18037, { name: "the usual suspects", seed: 2 }),
				tournamentCtxTeam(18255, { name: "ayam goreng", seed: 3 }),
				tournamentCtxTeam(18266, { name: "Fruitea!", seed: 5 }),
				tournamentCtxTeam(18212, { name: "The Huh Inkqisition", seed: 6 }),
				tournamentCtxTeam(18019, { name: "Monkey Barrel", seed: 7 }),
				tournamentCtxTeam(18210, { name: "Ras+1", seed: 8 }),
			],
		},
	});

const DATA = expandBracketData({
	stage: [
		{
			id: 1457,
			name: "Main Bracket",
			number: 1,
			settings: { groupCount: 1, roundCount: 4 },
			type: "swiss",
			createdAt: 1734685232,
		},
	],
	group: [{ id: 4443, number: 1, stageId: 1457 }],
	round: [
		[13715, 4443, 1, null, roundMaps.bestOf5Counterpick],
		[13716, 4443, 2, null, roundMaps.bestOf5Counterpick],
		[13717, 4443, 3, null, roundMaps.bestOf5Counterpick],
		[13718, 4443, 4, null, roundMaps.bestOf5Counterpick],
	],
	match: {
		13715: [
			[38584, 18248, 18266, 3, 0],
			[38585, 18037, 18212, 3, 0],
			[38586, 18255, 18019, 3, 0],
			[38587, 18210, null],
		],
		13716: [
			[38588, 18248, 18210, 3, 0],
			[38589, 18037, 18255, 3, 2],
			[38590, 18266, 18212, 3, 0],
			[38591, 18019, null],
		],
		13717: [
			[38592, 18248, 18037, 0, 3],
			[38593, 18019, 18266, 0, 3],
			[38594, 18210, 18255, 0, 3],
			[38595, 18212, null],
		],
	},
});
