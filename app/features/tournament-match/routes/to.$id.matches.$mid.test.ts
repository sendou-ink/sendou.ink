import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~/features/chat/ChatSystemMessage.server", () => ({
	send: vi.fn(),
	removeRoom: vi.fn(),
	setMetadata: vi.fn(),
}));

import type { z } from "zod";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import { action as removeMemberApiAction } from "~/features/api-public/routes/tournament.$id.teams.$teamId.remove-member";
import type { matchSchema } from "~/features/tournament-bracket/tournament-bracket-schemas.server";
import type { SerializeFrom } from "~/utils/remix";
import {
	assertResponseErrored,
	wrappedAction,
	wrappedLoader,
} from "~/utils/Test";
import { action, loader } from "./to.$id.matches.$mid";

const tournamentMatchAction = wrappedAction<typeof matchSchema>({
	action,
	isJsonSubmission: true,
});
const removeMemberApiActionWrapped = wrappedAction<
	z.ZodType<{ userId: number }>
>({
	action: removeMemberApiAction,
	isJsonSubmission: true,
});

const tournamentMatchLoader = wrappedLoader<SerializeFrom<typeof loader>>({
	loader,
});

const ROSTER_SIZE = 4;

/** Everybody but the organizer, who is created apart from them for their pinned id. */
const users = UserFactory.pool();

let tournamentId: number;
let matchId: number;
let teamOne: { id: number };
/** Organizes the tournament and plays on team one. Who the actions submit as. */
let organizerId: number;

const matchParams = () => ({ id: String(tournamentId), mid: String(matchId) });

/** Team one's first four members, the ones it fields when it has to pick. */
const activeRoster = () => [organizerId, ...users.ids(ROSTER_SIZE - 1)];

const loadMatchData = () => tournamentMatchLoader({ params: matchParams() });

const reportScoreAction = ({
	position,
	params = matchParams(),
	winnerTeamId = teamOne.id,
}: {
	position: number;
	params?: { id: string; mid: string };
	winnerTeamId?: number;
}) =>
	tournamentMatchAction(
		{
			_action: "REPORT_SCORE",
			position,
			winnerTeamId,
		},
		{ user: "admin", params },
	);

const setActiveRosterAction = (teamId = teamOne.id, roster = activeRoster()) =>
	tournamentMatchAction(
		{
			_action: "SET_ACTIVE_ROSTER",
			roster,
			teamId,
		},
		{ user: "admin", params: matchParams() },
	);

const removeMemberAction = ({
	userId,
	teamId,
}: {
	userId: number;
	teamId: number;
}) =>
	removeMemberApiActionWrapped(
		{ userId },
		{
			user: "admin",
			params: { id: String(tournamentId), teamId: String(teamId) },
		},
	);

const createTeam = (tournamentId: number, memberUserIds: number[]) =>
	TournamentTeamFactory.create(
		{ tournamentId, memberUserIds },
		{ isCheckedIn: true },
	);

describe("Tournament match page", () => {
	beforeEach(async () => {
		organizerId = (await UserFactory.createAdmin()).id;
		await users.create(9);

		const tournament = await TournamentFactory.create({
			authorId: organizerId,
		});
		tournamentId = tournament.id;

		// six members, so that team one has subs and a roster to pick from them
		teamOne = await createTeam(tournamentId, [organizerId, ...users.ids(5)]);
		await createTeam(tournamentId, users.ids(9).slice(5));

		[{ id: matchId }] = await TournamentFactory.startBracket(tournamentId);
	});

	describe("results", () => {
		it("is empty array for new match", async () => {
			const data = await loadMatchData();

			expect(data.results).toBeDefined();
			expect(data.results.length).toBe(0);
		});

		it("returns results for an in-progress match with correct fields", async () => {
			await setActiveRosterAction();
			await reportScoreAction({ position: 0 });

			const data = await loadMatchData();

			expect(data.results.length).toBe(1);

			const result = data.results[0];
			const playing = [...activeRoster(), ...users.ids(9).slice(5)];

			expect(result.stageId).toBe(1);
			expect(result.mode).toBe("SZ");
			expect(
				result.participants.every((participant) =>
					playing.includes(participant.userId),
				),
				"Result participants should only include active roster user ids",
			).toBeTruthy();
			expect(result.ko).toBe(null);
			expect(result.winnerTeamId).toBe(teamOne.id);
		});

		it("returns results for a completed match", async () => {
			await setActiveRosterAction();
			await reportScoreAction({ position: 0 });
			await reportScoreAction({ position: 1 });

			const data = await loadMatchData();

			expect(data.results.length).toBe(2);
		});
	});

	describe("mapList", () => {
		it("returns TO picked map list for match", async () => {
			const data = await loadMatchData();

			expect(data.mapList).toBeDefined();
			expect(data.mapList?.length).toBe(3);
			expect(data.mapList?.[0].source).toBe("TO");
			expect(data.mapList?.[0].mode).toBe("SZ");
			expect(data.mapList?.[0].stageId).toBe(1);
		});
	});

	describe("matchIsOver", () => {
		it("is false for new match", async () => {
			const data = await loadMatchData();

			expect(data.matchIsOver).toBe(false);
		});

		it("is true for a completed match", async () => {
			await setActiveRosterAction();
			await reportScoreAction({ position: 0 });
			await reportScoreAction({ position: 1 });

			const data = await loadMatchData();

			expect(data.matchIsOver).toBe(true);
		});
	});

	describe("active roster", () => {
		it("should return error if submitted active roster contains user id not in the team", async () => {
			const res = await setActiveRosterAction(teamOne.id, [
				...activeRoster().slice(0, ROSTER_SIZE - 1),
				users.id(6),
			]);

			assertResponseErrored(res, "Invalid roster");
		});

		it("should return error if submitted active roster is not of correct length", async () => {
			const res = await setActiveRosterAction(
				teamOne.id,
				activeRoster().slice(0, ROSTER_SIZE - 1),
			);

			assertResponseErrored(res, "Invalid roster length");
		});

		it("should return error if trying to report score without active roster", async () => {
			const res = await reportScoreAction({ position: 0 });

			assertResponseErrored(res, "Team one has no active roster");
		});

		it("should wipe active roster if member in it removed by tournament admin", async () => {
			await setActiveRosterAction();

			await removeMemberAction({ teamId: teamOne.id, userId: users.id(1) });

			const res = await reportScoreAction({ position: 0 });
			assertResponseErrored(res, "Team one has no active roster");
		});

		it("should retain active roster if member removed by tournament admin was not in it", async () => {
			await setActiveRosterAction();

			// team one's sixth member, so not one of the four it fields
			await removeMemberAction({ teamId: teamOne.id, userId: users.id(5) });

			const res = await reportScoreAction({ position: 0 });

			expect(res).toBe(null);
		});

		it("should not require setting active roster if both teams have no subs", async () => {
			const tournament = await TournamentFactory.create({
				authorId: organizerId,
			});
			const subLessTeam = await createTeam(tournament.id, [
				organizerId,
				...users.ids(ROSTER_SIZE - 1),
			]);
			await createTeam(tournament.id, users.ids(ROSTER_SIZE * 2 - 1).slice(3));

			const [match] = await TournamentFactory.startBracket(tournament.id);

			const res = await reportScoreAction({
				position: 0,
				params: { id: String(tournament.id), mid: String(match.id) },
				winnerTeamId: subLessTeam.id,
			});

			expect(res).toBe(null);
		});
	});

	describe("locked match", () => {
		it("should return error when reporting score for a match waiting on previous matches", async () => {
			await setActiveRosterAction();
			// the state under test is one an earlier match of a larger bracket puts this
			// row in, not one the match was created in
			// biome-ignore lint/plugin: written rather than seeded, see above
			await db
				.updateTable("TournamentMatch")
				.set({ opponentOne: JSON.stringify({ id: null }) })
				.where("id", "=", matchId)
				.execute();

			const res = await reportScoreAction({ position: 0 });

			assertResponseErrored(res, "Match is locked");
		});
	});

	describe("BYE matches", () => {
		// as above: a BYE and a TBD opponent are states the surrounding bracket
		// produces, so they are written here rather than seeded
		it("should 404 when accessing a BYE match", async () => {
			// biome-ignore lint/plugin: as above
			await db
				.updateTable("TournamentMatch")
				.set({ opponentTwo: null })
				.where("id", "=", matchId)
				.execute();

			await expect(loadMatchData()).rejects.toThrow("404");
		});

		it("should not 404 when an opponent is a TBD placeholder waiting for an earlier match", async () => {
			// biome-ignore lint/plugin: as above
			await db
				.updateTable("TournamentMatch")
				.set({ opponentTwo: JSON.stringify({ id: null }) })
				.where("id", "=", matchId)
				.execute();

			await expect(loadMatchData()).resolves.toBeDefined();
		});
	});
});
