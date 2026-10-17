import { beforeEach, describe, expect, test, vi } from "bun:test";
import { addDays, subDays } from "date-fns";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentLFGTeamFactory from "~/db/seed/factories/TournamentLFGTeamFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { assertResponseErrored, wrappedAction } from "~/utils/Test";
import type { lookingSchema } from "../tournament-lfg-schemas";
import * as TournamentLFGRepository from "../TournamentLFGRepository.server";
import { action as lookingAction } from "./to.$id.looking.server";

// likes and accepts notify the other group; not under test here
vi.mock("~/features/notifications/core/notify.server", () => ({
	notify: () => Promise.resolve(),
}));

const looking = wrappedAction<typeof lookingSchema>({ action: lookingAction });

const users = UserFactory.pool();

const inAWeek = () => dateToDatabaseTimestamp(addDays(new Date(), 7));

const createOpenTournament = (
	args: Partial<Parameters<typeof TournamentFactory.create>[0]> = {},
) =>
	TournamentFactory.create({
		authorId: users.id(1),
		startTimes: [inAWeek()],
		...args,
	});

/** Two registered teams (users 1-2 and 3-4) and a started bracket, registration closed as the start time has passed. */
const createStartedTournament = async () => {
	const tournament = await TournamentFactory.create({ authorId: users.id(1) });
	await TournamentTeamFactory.create(
		{ tournamentId: tournament.id, memberUserIds: [users.id(1), users.id(2)] },
		{ isCheckedIn: true },
	);
	await TournamentTeamFactory.create(
		{ tournamentId: tournament.id, memberUserIds: [users.id(3), users.id(4)] },
		{ isCheckedIn: true },
	);
	await TournamentFactory.startBracket(tournament.id);

	return tournament;
};

/** A placeholder of `likerUserId` that has liked the placeholder of `likedUserId`. */
const createLikedPair = async ({
	tournamentId,
	likedUserId,
	likerUserId,
}: {
	tournamentId: number;
	likedUserId: number;
	likerUserId: number;
}) => {
	const liked = await TournamentLFGTeamFactory.create({
		tournamentId,
		userId: likedUserId,
	});
	const liker = await TournamentLFGTeamFactory.create(
		{ tournamentId, userId: likerUserId },
		{ likedTeamIds: [liked.id] },
	);

	return { liked, liker };
};

const memberCountsOfGroups = async (tournamentId: number) =>
	(await TournamentLFGRepository.findLookingTeamsByTournamentId(tournamentId))
		.map((group) => group.members.length)
		.sort((a, b) => a - b);

const accept = ({
	tournamentId,
	userId,
	targetTeamId,
}: {
	tournamentId: number;
	userId: number;
	targetTeamId: number;
}) =>
	looking(
		{ _action: "ACCEPT", targetTeamId },
		{ user: userId, params: { id: String(tournamentId) } },
	);

describe("Tournament LFG LIKE", () => {
	beforeEach(async () => {
		await users.create(6);
	});

	test("errors after the tournament has started", async () => {
		const tournament = await createStartedTournament();
		const own = await TournamentLFGTeamFactory.create({
			tournamentId: tournament.id,
			userId: users.id(5),
		});
		const target = await TournamentLFGTeamFactory.create({
			tournamentId: tournament.id,
			userId: users.id(6),
		});

		assertResponseErrored(
			await looking(
				{ _action: "LIKE", targetTeamId: target.id },
				{ user: users.id(5), params: { id: String(tournament.id) } },
			),
		);

		expect(
			(await TournamentLFGRepository.findAllLikesByTeamId(own.id)).given,
		).toHaveLength(0);
	});
});

describe("Tournament LFG ACCEPT", () => {
	beforeEach(async () => {
		await users.create(6);
	});

	test("merges two groups while registration is open", async () => {
		const tournament = await createOpenTournament();
		const { liker } = await createLikedPair({
			tournamentId: tournament.id,
			likedUserId: users.id(1),
			likerUserId: users.id(2),
		});

		await accept({
			tournamentId: tournament.id,
			userId: users.id(1),
			targetTeamId: liker.id,
		});

		expect(await memberCountsOfGroups(tournament.id)).toEqual([2]);
	});

	test("errors after the tournament has started and leaves the groups as they were", async () => {
		const tournament = await createStartedTournament();
		const { liker } = await createLikedPair({
			tournamentId: tournament.id,
			likedUserId: users.id(5),
			likerUserId: users.id(6),
		});

		assertResponseErrored(
			await accept({
				tournamentId: tournament.id,
				userId: users.id(5),
				targetTeamId: liker.id,
			}),
		);

		expect(await memberCountsOfGroups(tournament.id)).toEqual([1, 1]);
	});

	test("errors after registration has closed", async () => {
		const tournament = await createOpenTournament({
			regClosesAt: dateToDatabaseTimestamp(subDays(new Date(), 1)),
		});
		const { liker } = await createLikedPair({
			tournamentId: tournament.id,
			likedUserId: users.id(1),
			likerUserId: users.id(2),
		});

		assertResponseErrored(
			await accept({
				tournamentId: tournament.id,
				userId: users.id(1),
				targetTeamId: liker.id,
			}),
		);

		expect(await memberCountsOfGroups(tournament.id)).toEqual([1, 1]);
	});

	test("does not merge away a team that has checked in", async () => {
		const tournament = await createOpenTournament();
		const ownTeam = await TournamentTeamFactory.create(
			{
				tournamentId: tournament.id,
				memberUserIds: [users.id(1), users.id(2)],
			},
			{ isLooking: true },
		);
		const checkedInTeam = await TournamentTeamFactory.create(
			{
				tournamentId: tournament.id,
				memberUserIds: [users.id(3), users.id(4)],
			},
			{ isLooking: true, isCheckedIn: true, likedTeamIds: [ownTeam.id] },
		);

		assertResponseErrored(
			await accept({
				tournamentId: tournament.id,
				userId: users.id(1),
				targetTeamId: checkedInTeam.id,
			}),
			"checked in",
		);

		expect(await memberCountsOfGroups(tournament.id)).toEqual([2, 2]);
	});

	test("errors when a member has no friend code", async () => {
		const tournament = await createOpenTournament();
		const withoutFriendCode = await UserFactory.create({ friendCode: null });
		const { liker } = await createLikedPair({
			tournamentId: tournament.id,
			likedUserId: users.id(1),
			likerUserId: withoutFriendCode.id,
		});

		assertResponseErrored(
			await accept({
				tournamentId: tournament.id,
				userId: users.id(1),
				targetTeamId: liker.id,
			}),
			"no friend code",
		);

		expect(await memberCountsOfGroups(tournament.id)).toEqual([1, 1]);
	});

	test("errors when a member has no in-game name and the tournament requires one", async () => {
		const tournament = await createOpenTournament({ requireInGameNames: true });
		const withInGameName = await UserFactory.create({
			profile: { inGameName: "Player#1234" },
		});
		const withoutInGameName = await UserFactory.create({ profile: null });
		const { liker } = await createLikedPair({
			tournamentId: tournament.id,
			likedUserId: withInGameName.id,
			likerUserId: withoutInGameName.id,
		});

		assertResponseErrored(
			await accept({
				tournamentId: tournament.id,
				userId: withInGameName.id,
				targetTeamId: liker.id,
			}),
			"no in-game name",
		);

		expect(await memberCountsOfGroups(tournament.id)).toEqual([1, 1]);
	});
});

describe("Tournament LFG JOIN_QUEUE", () => {
	beforeEach(async () => {
		await users.create(4);
	});

	test("errors for a registered team after the tournament has started", async () => {
		const tournament = await createStartedTournament();

		assertResponseErrored(
			await looking(
				{ _action: "JOIN_QUEUE" },
				{ user: users.id(1), params: { id: String(tournament.id) } },
			),
		);

		expect(await memberCountsOfGroups(tournament.id)).toEqual([]);
	});
});

describe("Tournament LFG group permissions", () => {
	beforeEach(async () => {
		await users.create(3);
	});

	const ownerId = () => users.id(1);
	const memberId = () => users.id(2);

	/** A registered team of the owner and a regular member in the queue, and a placeholder it could invite. */
	const createGroups = async () => {
		const tournament = await createOpenTournament();
		const group = await TournamentTeamFactory.create(
			{ tournamentId: tournament.id, memberUserIds: [ownerId(), memberId()] },
			{ isLooking: true },
		);
		const target = await TournamentLFGTeamFactory.create({
			tournamentId: tournament.id,
			userId: users.id(3),
		});

		return { tournament, group, target };
	};

	const act = (
		args: Parameters<typeof looking>[0],
		{ tournamentId, userId }: { tournamentId: number; userId: number },
	) => looking(args, { user: userId, params: { id: String(tournamentId) } });

	test("a regular member can't invite for the group", async () => {
		const { tournament, group, target } = await createGroups();

		await expect(
			act(
				{ _action: "LIKE", targetTeamId: target.id },
				{ tournamentId: tournament.id, userId: memberId() },
			),
		).rejects.toThrow("403");

		expect(
			(await TournamentLFGRepository.findAllLikesByTeamId(group.id)).given,
		).toHaveLength(0);
	});

	test("a member the owner made a manager can invite for the group", async () => {
		const { tournament, group, target } = await createGroups();

		await act(
			{ _action: "GIVE_MANAGER", userId: memberId() },
			{ tournamentId: tournament.id, userId: ownerId() },
		);
		await act(
			{ _action: "LIKE", targetTeamId: target.id },
			{ tournamentId: tournament.id, userId: memberId() },
		);

		expect(
			(await TournamentLFGRepository.findAllLikesByTeamId(group.id)).given,
		).toEqual([{ teamId: target.id }]);
	});

	test("only the owner edits the group's note", async () => {
		const { tournament } = await createGroups();

		await expect(
			act(
				{ _action: "UPDATE_GROUP", note: "From the member" },
				{ tournamentId: tournament.id, userId: memberId() },
			),
		).rejects.toThrow("403");
		await act(
			{ _action: "UPDATE_GROUP", note: "From the owner" },
			{ tournamentId: tournament.id, userId: ownerId() },
		);

		const groups = await TournamentLFGRepository.findLookingTeamsByTournamentId(
			tournament.id,
		);
		expect(groups.map((group) => group.note)).toContain("From the owner");
	});
});
