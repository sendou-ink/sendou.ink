import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { adminActionSchema } from "~/features/tournament/actions/to.$id.admin.server";
import {
	dbInsertTournament,
	dbInsertTournamentTeam,
	dbStartTournament,
} from "~/features/tournament/tournament-test-utils";
import type { SerializeFrom } from "~/utils/remix";
import {
	assertResponseErrored,
	dbInsertUsers,
	dbReset,
	wrappedAction,
	wrappedLoader,
} from "~/utils/Test";
import { action as adminAction } from "../../tournament/routes/to.$id.admin";
import type { matchSchema } from "../tournament-bracket-schemas.server";
import { action, loader } from "./to.$id.matches.$mid";

const tournamentMatchAction = wrappedAction<typeof matchSchema>({
	action,
	isJsonSubmission: true,
});
const tournamentAdminAction = wrappedAction<typeof adminActionSchema>({
	action: adminAction,
	isJsonSubmission: true,
});

const tournamentMatchLoader = wrappedLoader<SerializeFrom<typeof loader>>({
	loader,
});

const loadMatchData = () =>
	tournamentMatchLoader({
		params: { id: "1", mid: "1" },
	});

const reportScoreAction = ({
	position,
	params = { id: "1", mid: "1" },
	winnerTeamId = 1,
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

const setActiveRosterAction = (teamId = 1, roster = [1, 2, 3, 4]) =>
	tournamentMatchAction(
		{
			_action: "SET_ACTIVE_ROSTER",
			roster: roster,
			teamId,
		},
		{ user: "admin", params: { id: "1", mid: "1" } },
	);

const removeMemberAction = ({
	userId,
	teamId,
}: {
	userId: number;
	teamId: number;
}) =>
	tournamentAdminAction(
		{
			_action: "REMOVE_MEMBER",
			memberId: userId,
			teamId,
		},
		{ user: "admin", params: { id: "1" } },
	);

describe("Tournament match page", () => {
	beforeEach(async () => {
		dbInsertUsers(10);
		await dbInsertTournament();
		await dbInsertTournamentTeam({
			membersCount: 6,
			ownerId: 1,
		});
		await dbInsertTournamentTeam({
			membersCount: 4,
			ownerId: 7,
		});
		await dbStartTournament([1, 2]);
	});

	afterEach(() => {
		dbReset();
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

			expect(result.stageId).toBe(1);
			expect(result.mode).toBe("SZ");
			expect(
				result.participants.every((participant) =>
					[1, 2, 3, 4, 7, 8, 9, 10].includes(participant.userId),
				),
				"Result participants should only include active roster user ids",
			).toBeTruthy();
			expect(result.opponentOnePoints).toBe(null);
			expect(result.opponentTwoPoints).toBe(null);
			expect(result.winnerTeamId).toBe(1);
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
			const res = await setActiveRosterAction(1, [1, 2, 3, 7]);

			assertResponseErrored(res, "Invalid roster");
		});

		it("should return error if submitted active roster is not of correct length", async () => {
			const res = await setActiveRosterAction(1, [1, 2, 3]);

			assertResponseErrored(res, "Invalid roster length");
		});

		it("should return error if trying to report score without active roster", async () => {
			const res = await reportScoreAction({ position: 0 });

			assertResponseErrored(res, "Team one has no active roster");
		});

		it("should wipe active roster if member in it removed by tournament admin", async () => {
			await setActiveRosterAction();

			await removeMemberAction({
				teamId: 1,
				userId: 2,
			});

			const res = await reportScoreAction({ position: 0 });
			assertResponseErrored(res, "Team one has no active roster");
		});

		it("should retain active roster if member removed by tournament admin was not in it", async () => {
			await setActiveRosterAction();
			await removeMemberAction({
				teamId: 1,
				userId: 5,
			});

			const res = await reportScoreAction({ position: 0 });

			expect(res).toBe(null);
		});

		it("should not require setting active roster if both teams have no subs", async () => {
			await dbInsertTournament();
			await dbInsertTournamentTeam({
				membersCount: 4,
				ownerId: 1,
				tournamentId: 2,
			});
			await dbInsertTournamentTeam({
				membersCount: 4,
				ownerId: 5,
				tournamentId: 2,
			});
			await dbStartTournament([3, 4], 2);

			const res = await reportScoreAction({
				position: 0,
				params: {
					id: "2",
					mid: "2",
				},
				winnerTeamId: 3,
			});

			expect(res).toBe(null);
		});
	});
});
