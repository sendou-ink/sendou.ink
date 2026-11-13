import * as R from "remeda";
import { beforeEach, describe, expect, test } from "vitest";
import * as TournamentStaffFactory from "~/db/seed/factories/TournamentStaffFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { clearTournamentDataCache } from "~/features/tournament-bracket/core/Tournament.server";
import { createStartedLanTournament } from "~/features/tournament-stations/tests/fixtures";
import { wrappedLoader } from "~/utils/Test";
import {
	loader,
	type TournamentAdminBoardLoaderData,
} from "./to.$id.admin.board.server";

const boardLoader = wrappedLoader<TournamentAdminBoardLoaderData>({ loader });

const users = UserFactory.pool();
const organizerId = () => users.id(1);
const otherUserId = () => users.id(18);

const createTournament = async () => {
	const { tournamentId } = await createStartedLanTournament({
		authorId: organizerId(),
		teamRosters: R.chunk(users.ids(17).slice(1), 4),
	});

	return { tournamentId, params: { id: String(tournamentId) } };
};

describe("stations board loader", () => {
	beforeEach(async () => {
		await users.create(18);
	});

	test.each([
		{ role: "STREAMER" as const, canEdit: true },
		{ role: "POOL_CAPTAIN" as const, canEdit: false },
	])(
		"shows the board to a $role, editable: $canEdit",
		async ({ role, canEdit }) => {
			const { tournamentId, params } = await createTournament();
			await TournamentStaffFactory.create({
				tournamentId,
				userId: otherUserId(),
				role,
			});
			clearTournamentDataCache(tournamentId);

			const data = await boardLoader({ user: otherUserId(), params });

			expect(data.canEdit).toBe(canEdit);
			expect(data.stations).toHaveLength(2);
			expect(data.waiting).toHaveLength(2);
		},
	);

	test("redirects a user who isn't on staff", async () => {
		const { params } = await createTournament();

		await expect(boardLoader({ user: otherUserId(), params })).rejects.toThrow(
			"302",
		);
	});
});
