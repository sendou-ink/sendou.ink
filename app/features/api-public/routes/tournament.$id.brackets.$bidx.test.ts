import { addDays } from "date-fns";
import { beforeEach, describe, expect, test } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { wrappedLoader } from "~/utils/Test";
import type { GetTournamentBracketResponse } from "../schema";
import { loader } from "./tournament.$id.brackets.$bidx";

const DAY_2_BRACKET_IDX = 1;

const users = UserFactory.pool();

const bracketLoader = wrappedLoader<Response>({ loader });

const fetchBracket = async (tournamentId: number, bracketIdx: number) => {
	const response = await bracketLoader({
		params: { id: String(tournamentId), bidx: String(bracketIdx) },
	});

	return (await response.json()) as GetTournamentBracketResponse;
};

/** Four one-player teams play groups, all advancing to a day 2 bracket whose check-in opens tomorrow. Only the first team has checked in to it. */
const tournamentBeforeDay2CheckIn = async () => {
	const tournament = await TournamentFactory.create({
		authorId: users.id(1),
		minMembersPerTeam: 1,
		bracketProgression: [
			{
				type: "round_robin",
				name: "Groups",
				requiresCheckIn: false,
				settings: {},
			},
			{
				type: "single_elimination",
				name: "Day 2",
				requiresCheckIn: true,
				startTime: dateToDatabaseTimestamp(addDays(new Date(), 1)),
				settings: {},
				sources: [{ bracketIdx: 0, placements: [1, 2, 3, 4] }],
			},
		],
	});

	const teamIds: number[] = [];
	for (const [index, userId] of users.ids().entries()) {
		const team = await TournamentTeamFactory.create(
			{ tournamentId: tournament.id, memberUserIds: [userId] },
			{
				isCheckedIn: true,
				checkedInToBracketIdxs: index === 0 ? [DAY_2_BRACKET_IDX] : [],
			},
		);
		teamIds.push(team.id);
	}

	await TournamentFactory.playOut(tournament.id, 0);

	return { tournamentId: tournament.id, teamIds };
};

describe("GET /api/tournament/:id/brackets/:bidx", () => {
	beforeEach(async () => {
		await users.create(4);
	});

	test("lists the teams not checked in to a bracket as not checked in before its check-in opens", async () => {
		const {
			tournamentId,
			teamIds: [checkedInTeamId, ...pendingTeamIds],
		} = await tournamentBeforeDay2CheckIn();

		const { teams } = await fetchBracket(tournamentId, DAY_2_BRACKET_IDX);

		expect(teams).toHaveLength(4);
		expect(teams).toContainEqual({ id: checkedInTeamId, checkedIn: true });
		for (const teamId of pendingTeamIds) {
			expect(teams).toContainEqual({ id: teamId, checkedIn: false });
		}
	});
});
