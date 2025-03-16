// separate from brackets-manager as this wasn't part of the original brackets-manager library

import type { TournamentRepositoryInsertableMatch } from "~/features/tournament/TournamentRepository.server";
import { TOURNAMENT } from "~/features/tournament/tournament-constants";
import type { TournamentManagerDataSet } from "~/modules/brackets-manager/types";
import type { InputStage, Match } from "~/modules/brackets-model";
import { nullFilledArray } from "~/utils/arrays";
import invariant from "~/utils/invariant";
import type { Bracket, Standing } from "./Bracket";

export function create(
	args: Omit<InputStage, "type" | "number">,
): TournamentManagerDataSet {
	const swissSettings = args.settings?.swiss;

	const groupCount =
		swissSettings?.groupCount ?? TOURNAMENT.SWISS_DEFAULT_GROUP_COUNT;
	const roundCount =
		swissSettings?.roundCount ?? TOURNAMENT.SWISS_DEFAULT_ROUND_COUNT;

	const group = nullFilledArray(groupCount).map((_, i) => ({
		id: i,
		stage_id: 0,
		number: i + 1,
	}));

	let roundId = 0;
	return {
		group,
		match: firstRoundMatches({ seeding: args.seeding, groupCount, roundCount }),
		round: group.flatMap((g) =>
			nullFilledArray(roundCount).map((_, i) => ({
				id: roundId++,
				group_id: g.id,
				number: i + 1,
				stage_id: 0,
			})),
		),
		stage: [
			{
				id: 0,
				name: args.name,
				number: 1,
				settings: args.settings ?? {},
				tournament_id: args.tournamentId,
				type: "swiss",
			},
		],
	};
}

function firstRoundMatches({
	seeding,
	groupCount,
	roundCount,
}: {
	seeding: InputStage["seeding"];
	groupCount: number;
	roundCount: number;
}): Match[] {
	// split the teams to one or more groups. For example with 16 teams and 3 groups this would result in
	// group 1: 1, 4, 7, 10, 13, 16
	// group 2: 2, 5, 8, 11, 14
	// group 3: 3, 6, 9, 12, 15
	const groups = splitToGroups();

	const result: Match[] = [];

	let matchId = 0;
	for (const [groupIdx, participants] of groups.entries()) {
		// if there is an uneven number of teams the last seed gets a bye
		const bye = participants.length % 2 === 0 ? null : participants.pop();

		const halfI = participants.length / 2;
		const upperHalf = participants.slice(0, halfI);
		const lowerHalf = participants.slice(halfI);

		invariant(
			upperHalf.length === lowerHalf.length,
			"firstRoundMatches: halfs not equal",
		);

		// first round every team plays the matching team "on the opposite side"
		// so for example with 8 teams match ups look like this:
		// seed 1 vs. seed 5
		// seed 2 vs. seed 6
		// seed 3 vs. seed 7
		// seed 4 vs. seed 8
		// ---
		// this way each match has "equal distance"
		const roundId = groupIdx * roundCount;
		for (let i = 0; i < upperHalf.length; i++) {
			const upper = upperHalf[i];
			const lower = lowerHalf[i];

			result.push({
				id: matchId++,
				group_id: groupIdx,
				stage_id: 0,
				round_id: roundId,
				number: i + 1,
				opponent1: {
					id: upper,
				},
				opponent2: {
					id: lower,
				},
				status: 2,
			});
		}

		if (bye) {
			result.push({
				id: matchId++,
				group_id: groupIdx,
				stage_id: 0,
				round_id: roundId,
				number: upperHalf.length + 1,
				opponent1: {
					id: bye,
				},
				opponent2: null,
				status: 2,
			});
		}
	}

	return result;

	function splitToGroups() {
		if (!seeding) return [];
		if (groupCount === 1) return [[...seeding]];

		const groups: number[][] = nullFilledArray(groupCount).map(() => []);

		for (let i = 0; i < seeding.length; i++) {
			const groupIndex = i % groupCount;
			groups[groupIndex].push(seeding[i]!);
		}

		return groups;
	}
}

export function generateMatchUps({
	bracket,
	groupId,
}: {
	bracket: Bracket;
	groupId: number;
}) {
	// lets consider only this groups matches
	// in the case that there are more than one group
	const groupsMatches = bracket.data.match.filter(
		(m) => m.group_id === groupId,
	);

	invariant(groupsMatches.length > 0, "No matches found for group");

	// new matches can't be generated till old are over
	if (!everyMatchOver(groupsMatches)) {
		throw new Error("Not all matches are over");
	}

	const groupsTeams = groupsMatches
		.flatMap((match) => [match.opponent1, match.opponent2])
		.filter(Boolean);
	const groupsStandings = bracket.standings.filter((standing) => {
		return groupsTeams.some((team) => team?.id === standing.team.id);
	});

	// teams who have dropped out are not considered
	const standingsWithoutDropouts = groupsStandings.filter(
		(s) => !s.team.droppedOut,
	);

	// if group has uneven number of teams
	// the lowest standing team gets a bye
	// that did not already receive one
	const { bye, play } = splitToByeAndPlay(
		standingsWithoutDropouts,
		groupsMatches,
	);

	// split participating teams to sections
	// each section resolves matches between teams of that section
	// section could look something like this (team counts inaccurate):
	// 3-0'ers - 4 members
	// 2-1'ers - 6 members
	// 1-2'ers - 6 members
	// 0-3'ers - 4 members
	// ---
	// if a section has an uneven number of teams
	// the lowest standing team gets dropped to the section below
	// or if the lowest section is unevent the highest team of the lowest section
	// gets promoted to the section above
	let sections = splitPlayingTeamsToSections(play);

	let iteration = 0;
	let matches: [opponentOneId: number, opponentTwoId: number][] = [];
	while (true) {
		iteration++;
		if (iteration > 100) {
			throw new Error("Swiss bracket generation failed (too many iterations)");
		}

		// lets attempt to create matches for the current sections
		// might fail if some section can't be matches so that nobody replays
		const maybeMatches = sectionsToMatches(sections, groupsMatches);

		// ok good matches found!
		if (Array.isArray(maybeMatches)) {
			matches = maybeMatches;
			break;
		}

		// for some reason we couldn't find new opponent for everyone
		// even with everyone in the same section, so let's just replay
		// (should not be possible to happen if running swiss normally)
		if (sections.length === 1) {
			const maybeMatches = sectionsToMatches(sections, groupsMatches, true);
			if (Array.isArray(maybeMatches)) {
				matches = maybeMatches;
				break;
			}

			throw new Error(
				"Swiss bracket generation failed (failed to generate matches even with fallback behavior)",
			);
		}

		// let's unify sections so that we can try again with a better chance
		sections = unifySections(sections, maybeMatches.impossibleSectionIdx);
	}

	// finally lets just convert the generated pairs to match objects
	// for the database
	const newRoundId = bracket.data.round
		.slice()
		.sort((a, b) => a.id - b.id)
		.filter((r) => r.group_id === groupId)
		.find(
			(r) => r.id > Math.max(...groupsMatches.map((match) => match.round_id)),
		)?.id;
	invariant(newRoundId, "newRoundId not found");
	let matchNumber = 1;
	const result: TournamentRepositoryInsertableMatch[] = matches.map(
		([opponentOneId, opponentTwoId]) => ({
			groupId,
			number: matchNumber++,
			roundId: newRoundId,
			stageId: groupsMatches[0].stage_id,
			opponentOne: JSON.stringify({
				id: opponentOneId,
			}),
			opponentTwo: JSON.stringify({
				id: opponentTwoId,
			}),
		}),
	);

	if (bye) {
		result.push({
			groupId,
			stageId: groupsMatches[0].stage_id,
			roundId: newRoundId,
			number: matchNumber,
			opponentOne: JSON.stringify({
				id: bye.team.id,
			}),
			opponentTwo: JSON.stringify(null),
		});
	}

	return result;
}

function everyMatchOver(matches: Match[]) {
	for (const match of matches) {
		// bye
		if (!match.opponent1 || !match.opponent2) continue;

		if (match.opponent1.result !== "win" && match.opponent2.result !== "win") {
			return false;
		}
	}

	return true;
}

function splitToByeAndPlay(standings: Standing[], matches: Match[]) {
	if (standings.length % 2 === 0) {
		return {
			bye: null,
			play: standings,
		};
	}

	const teamsThatHaveHadByes = matches
		.filter((m) => m.opponent2 === null)
		.map((m) => m.opponent1?.id);

	const play = standings.slice();
	const bye = play
		.slice()
		.reverse()
		.find((s) => !teamsThatHaveHadByes.includes(s.team.id));

	// should not happen
	if (!bye) {
		const reBye = play[play.length - 1];

		return {
			bye: reBye,
			play: play.filter((s) => s.team.id !== reBye.team.id),
		};
	}

	return {
		bye: bye,
		play: play.filter((s) => s.team.id !== bye.team.id),
	};
}

type TournamentDataTeamSections = Standing[][];

function splitPlayingTeamsToSections(standings: Standing[]) {
	let result: TournamentDataTeamSections = [];

	let lastMapWins = -1;
	let currentSection: Standing[] = [];
	for (const standing of standings) {
		const mapWins = standing.stats?.mapWins;
		invariant(mapWins !== undefined, "mapWins not found");

		if (mapWins !== lastMapWins) {
			if (currentSection.length > 0) result.push(currentSection);
			currentSection = [];
		}

		currentSection.push(standing);
		lastMapWins = mapWins;
	}
	result.push(currentSection);

	result = evenOutSectionsForward(result);
	result = evenOutSectionsBackward(result);

	return result;
}

function evenOutSectionsForward(sections: TournamentDataTeamSections) {
	if (sections.every((section) => section.length % 2 === 0)) {
		return sections;
	}

	const result: TournamentDataTeamSections = [];

	let pushedStanding: Standing | null = null;
	for (const [i, section] of sections.entries()) {
		const newSection = section.slice();

		if (pushedStanding) {
			newSection.unshift(pushedStanding);
			pushedStanding = null;
		}

		if (newSection.length % 2 !== 0 && i < sections.length - 1) {
			pushedStanding = newSection.pop()!;
		}

		result.push(newSection);
	}

	return result;
}

function evenOutSectionsBackward(sections: TournamentDataTeamSections) {
	if (sections.every((section) => section.length % 2 === 0)) {
		return sections;
	}

	const result: TournamentDataTeamSections = [];

	let pushedTeam: Standing | null = null;
	for (const [i, section] of sections.slice().reverse().entries()) {
		const newSection = section.slice();

		if (pushedTeam) {
			newSection.push(pushedTeam);
			pushedTeam = null;
		}

		if (newSection.length % 2 !== 0) {
			if (i === sections.length - 1) {
				throw new Error("Can't even out sections");
			}
			pushedTeam = newSection.shift()!;
		}

		result.unshift(newSection);
	}

	return result;
}

function sectionsToMatches(
	sections: TournamentDataTeamSections,
	previousMatches: Match[],
	fallbackBehaviorWithReplays = false,
):
	| [opponentOneId: number, opponentTwoId: number][]
	| { impossibleSectionIdx: number } {
	const matches: [opponentOneId: number, opponentTwoId: number][] = [];

	for (const [i, section] of sections.entries()) {
		const isLossless = section.every(
			(standing) => standing.stats!.setLosses === 0,
		);
		const isWinless = section.every(
			(standing) => standing.stats!.setWins === 0,
		);

		if (isLossless || isWinless || fallbackBehaviorWithReplays) {
			// doing it like this to make it so that if everyone plays to their seed
			// then seeds 1 & 2 meet in the final round (assuming proper amount of rounds)
			// these sections can't have replays no matter how we divide them
			matches.push(...matchesBySeed(section));
		} else {
			const sectionMatches = matchesByNotPlayedBefore(section, previousMatches);
			if (sectionMatches === null) {
				return { impossibleSectionIdx: i };
			}

			matches.push(...sectionMatches);
		}
	}

	return matches;
}

function unifySections(
	sections: TournamentDataTeamSections,
	sectionToUnifyIdx: number,
) {
	const result: TournamentDataTeamSections = sections.slice();
	if (sectionToUnifyIdx < sections.length - 1) {
		// Combine section at sectionToUnifyIdx with the section after it
		const currentSection = result[sectionToUnifyIdx];
		const nextSection = result[sectionToUnifyIdx + 1];
		const combinedSection = [...currentSection, ...nextSection];
		result[sectionToUnifyIdx] = combinedSection;
		result.splice(sectionToUnifyIdx + 1, 1);
	} else {
		// Combine last section with the section before it
		const lastSection = result.pop()!;
		const previousSection = result.pop()!;
		const combinedSection = [...previousSection, ...lastSection];
		result.push(combinedSection);
	}

	invariant(
		sections.length - 1 === result.length,
		"unifySections: length invalid",
	);
	return result;
}

function matchesBySeed(
	teams: Standing[],
): [opponentOneId: number, opponentTwoId: number][] {
	// we know that here nobody has played each other
	const sortedBySeed = teams.slice().sort((a, b) => {
		invariant(a.team.seed, "matchesBySeed: a.seed is falsy");
		invariant(b.team.seed, "matchesBySeed: b.seed is falsy");

		return a.team.seed - b.team.seed;
	});

	const matches: [opponentOneId: number, opponentTwoId: number][] = [];
	while (sortedBySeed.length > 0) {
		const one = sortedBySeed.shift()!;
		const two = sortedBySeed.pop()!;

		matches.push([one.team.id, two.team.id]);
	}

	return matches;
}

function matchesByNotPlayedBefore(
	teams: Standing[],
	previousMatches: Match[],
): [opponentOneId: number, opponentTwoId: number][] | null {
	invariant(teams.length % 2 === 0, "matchesByNotPlayedBefore: uneven teams");

	const alreadyPlayed = previousMatches.reduce((acc, cur) => {
		if (!cur.opponent1?.id || !cur.opponent2?.id) return acc;

		if (!acc.has(cur.opponent1.id)) {
			acc.set(cur.opponent1.id, new Set());
		}
		acc.get(cur.opponent1.id)!.add(cur.opponent2.id);

		if (!acc.has(cur.opponent2.id)) {
			acc.set(cur.opponent2.id, new Set());
		}
		acc.get(cur.opponent2.id)!.add(cur.opponent1.id);

		return acc;
	}, new Map<number, Set<number>>());

	const possibleRounds = makeRounds(teams.length);

	for (const round of possibleRounds) {
		let allNew = true;
		for (const pair of round) {
			const one = teams[pair[0]];
			const two = teams[pair[1]];

			if (alreadyPlayed.get(one.team.id)?.has(two.team.id)) {
				allNew = false;
				break;
			}
		}

		if (!allNew) continue;

		const matches: [opponentOneId: number, opponentTwoId: number][] = [];
		for (const pair of round) {
			const one = teams[pair[0]];
			const two = teams[pair[1]];

			matches.push([one.team.id, two.team.id]);
		}
		return matches;
	}

	return null;
}

// https://stackoverflow.com/a/75330079
function makeRounds(n: number) {
	const pairings = [];
	const max = n - 1;
	for (let i = 0; i < max; i++) {
		const pairing = [[max, i]];
		for (let k = 1; k < n / 2; k++) {
			pairing.push([(i + k) % max, (max + i - k) % max]);
		}
		pairings.push(pairing);
	}
	return pairings;
}
