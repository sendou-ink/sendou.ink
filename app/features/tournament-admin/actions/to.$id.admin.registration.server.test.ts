import { addDays } from "date-fns";
import { beforeEach, describe, expect, test, vi } from "vitest";
import * as CalendarEventVenueFactory from "~/db/seed/factories/CalendarEventVenueFactory";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentLFGTeamFactory from "~/db/seed/factories/TournamentLFGTeamFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import * as TournamentLFGRepository from "~/features/tournament-lfg/TournamentLFGRepository.server";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { wrappedAction } from "~/utils/Test";
import {
	type adminRegistrationFormSchema,
	newPlaceholderOwnerId,
} from "../tournament-admin-registration-schemas";
import { action } from "./to.$id.admin.registration.server";

vi.mock("~/features/chat/ChatSystemMessage.server", async (importOriginal) => ({
	...(await importOriginal()),
	send: vi.fn(),
	notifyRoomsChanged: vi.fn(),
}));

const registrationAction = wrappedAction<typeof adminRegistrationFormSchema>({
	action,
	isJsonSubmission: true,
});

const users = UserFactory.pool();
const organizerId = () => users.id(1);
const playerId = () => users.id(2);
const teamOwnerId = () => users.id(2);
const teamMemberId = () => users.id(3);
const soloPlayerId = () => users.id(4);

const createTournament = async ({
	isLan,
	requireInGameNames = false,
}: {
	isLan: boolean;
	requireInGameNames?: boolean;
}) => {
	const tournament = await TournamentFactory.create({
		authorId: organizerId(),
		requireInGameNames,
	});
	if (isLan) {
		await CalendarEventVenueFactory.create({ eventId: tournament.eventId });
	}

	return tournament;
};

const userMember = (userId: number) => ({
	isPlaceholder: false,
	userId,
	placeholderName: null,
	inGameName: null,
	tournamentName: null,
});

const placeholderMember = (placeholderName: string) => ({
	isPlaceholder: true,
	userId: null,
	placeholderName,
	inGameName: null,
	tournamentName: null,
});

const registration = (
	members: Array<{
		isPlaceholder: boolean;
		userId: number | null;
		placeholderName: string | null;
		inGameName: string | null;
		tournamentName: string | null;
	}>,
	ownerId: string,
) => ({
	_action: "UPSERT_REGISTRATION" as const,
	linkedTeam: false,
	pickUpName: "Walk-ins",
	logo: null,
	teamId: null,
	ownerId,
	members,
	mapPool: [],
});

const membersOf = (tournamentId: number) =>
	db
		.selectFrom("TournamentTeamMember")
		.innerJoin(
			"TournamentTeam",
			"TournamentTeam.id",
			"TournamentTeamMember.tournamentTeamId",
		)
		.innerJoin("User", "User.id", "TournamentTeamMember.userId")
		.select([
			"User.id",
			"User.username",
			"User.isPlaceholder",
			"TournamentTeamMember.role",
		])
		.where("TournamentTeam.tournamentId", "=", tournamentId)
		.orderBy("User.username", "asc")
		.execute();

describe("Admin registration action with players without an account", () => {
	beforeEach(async () => {
		await users.create(2);
	});

	test("registers a LAN team made only of them", async () => {
		const tournament = await createTournament({ isLan: true });

		await registrationAction(
			registration(
				[placeholderMember("Mika"), placeholderMember("Juno")],
				newPlaceholderOwnerId("Mika"),
			),
			{ user: organizerId(), params: { id: String(tournament.id) } },
		);

		expect(await membersOf(tournament.id)).toEqual([
			{
				id: expect.any(Number),
				username: "Juno",
				isPlaceholder: 1,
				role: "REGULAR",
			},
			{
				id: expect.any(Number),
				username: "Mika",
				isPlaceholder: 1,
				role: "OWNER",
			},
		]);
	});

	test("rejects them in an online tournament", async () => {
		const tournament = await createTournament({ isLan: false });

		const res = await registrationAction(
			registration([placeholderMember("Mika")], newPlaceholderOwnerId("Mika")),
			{ user: organizerId(), params: { id: String(tournament.id) } },
		);

		expect(res.fieldErrors["members[0].placeholderName"]).toBe(
			"forms:errors.regPlaceholderLanOnly",
		);
		expect(await membersOf(tournament.id)).toEqual([]);
	});

	test("never adds one to another team", async () => {
		const tournament = await createTournament({ isLan: true });
		const placeholder = await UserFactory.createPlaceholder();
		await TournamentTeamFactory.create({
			tournamentId: tournament.id,
			memberUserIds: [placeholder.id],
		});
		const otherTournament = await createTournament({ isLan: true });

		const res = await registrationAction(
			registration(
				[
					{
						isPlaceholder: false,
						userId: placeholder.id,
						placeholderName: null,
						inGameName: null,
						tournamentName: null,
					},
				],
				String(placeholder.id),
			),
			{ user: organizerId(), params: { id: String(otherTournament.id) } },
		);

		expect(res.fieldErrors["members[0].userId"]).toBe(
			"forms:errors.regMemberInvalid",
		);
	});

	test("renames one on the team", async () => {
		const tournament = await createTournament({ isLan: true });
		const placeholder = await UserFactory.createPlaceholder({ name: "Mika" });
		const team = await TournamentTeamFactory.create({
			tournamentId: tournament.id,
			memberUserIds: [placeholder.id, playerId()],
			team: { name: "Walk-ins", prefersNotToHost: 0, teamId: null },
		});

		await registrationAction(
			{
				...registration(
					[
						{
							isPlaceholder: true,
							userId: placeholder.id,
							placeholderName: "Mikaela",
							inGameName: null,
							tournamentName: null,
						},
						{
							isPlaceholder: false,
							userId: playerId(),
							placeholderName: null,
							inGameName: null,
							tournamentName: null,
						},
					],
					String(placeholder.id),
				),
				tournamentTeamId: team.id,
			},
			{ user: organizerId(), params: { id: String(tournament.id) } },
		);

		expect(
			(await membersOf(tournament.id)).map((member) => member.username),
		).toContain("Mikaela");
	});

	test("makes a new one captain of an existing team", async () => {
		const tournament = await createTournament({ isLan: true });
		const team = await TournamentTeamFactory.create({
			tournamentId: tournament.id,
			memberUserIds: [playerId()],
			team: { name: "Walk-ins", prefersNotToHost: 0, teamId: null },
		});

		await registrationAction(
			{
				...registration(
					[userMember(playerId()), placeholderMember("Mika")],
					newPlaceholderOwnerId("Mika"),
				),
				tournamentTeamId: team.id,
			},
			{ user: organizerId(), params: { id: String(tournament.id) } },
		);

		const members = await membersOf(tournament.id);
		expect(members.find((member) => member.role === "OWNER")?.username).toBe(
			"Mika",
		);
		expect(members.find((member) => member.id === playerId())?.role).toBe(
			"REGULAR",
		);
	});

	test("requires an in-game name from a new one when the tournament requires them", async () => {
		const tournament = await createTournament({
			isLan: true,
			requireInGameNames: true,
		});

		const res = await registrationAction(
			registration([placeholderMember("Mika")], newPlaceholderOwnerId("Mika")),
			{ user: organizerId(), params: { id: String(tournament.id) } },
		);

		expect(res.fieldErrors["members[0].inGameName"]).toBe(
			"forms:errors.required",
		);
	});

	test("rejects a user with an account sent as one", async () => {
		const tournament = await createTournament({ isLan: true });

		const res = await registrationAction(
			registration(
				[
					{
						...userMember(playerId()),
						isPlaceholder: true,
						placeholderName: "Mika",
					},
				],
				String(playerId()),
			),
			{ user: organizerId(), params: { id: String(tournament.id) } },
		);

		expect(res.fieldErrors["members[0].placeholderName"]).toBe(
			"forms:errors.regMemberInvalid",
		);
	});

	test("rejects a name a player without an account of another team has", async () => {
		const tournament = await createTournament({ isLan: true });
		const placeholder = await UserFactory.createPlaceholder({ name: "Mika" });
		await TournamentTeamFactory.create({
			tournamentId: tournament.id,
			memberUserIds: [placeholder.id],
		});

		const res = await registrationAction(
			registration([placeholderMember("mika")], newPlaceholderOwnerId("mika")),
			{ user: organizerId(), params: { id: String(tournament.id) } },
		);

		expect(res.fieldErrors["members[0].placeholderName"]).toBe(
			"forms:errors.regPlaceholderNameTaken",
		);
	});

	test("rejects two of them with the same name on one team", async () => {
		const tournament = await createTournament({ isLan: true });

		const res = await registrationAction(
			registration(
				[placeholderMember("Mika"), placeholderMember("Mika")],
				newPlaceholderOwnerId("Mika"),
			),
			{ user: organizerId(), params: { id: String(tournament.id) } },
		);

		expect(res.fieldErrors["members[1].placeholderName"]).toBe(
			"forms:errors.regPlaceholderNameTaken",
		);
	});
});

describe("Admin registration action", () => {
	beforeEach(async () => {
		await users.create(4);
	});

	test("adding a queued solo player to a looking team removes the solo entry and keeps the team looking", async () => {
		const tournament = await TournamentFactory.create({
			authorId: organizerId(),
			startTimes: [dateToDatabaseTimestamp(addDays(new Date(), 7))],
		});
		const team = await TournamentTeamFactory.create(
			{
				tournamentId: tournament.id,
				memberUserIds: [teamOwnerId(), teamMemberId()],
				team: { name: "Looking Team", prefersNotToHost: 0, teamId: null },
			},
			{ isLooking: true },
		);
		await TournamentLFGTeamFactory.create({
			tournamentId: tournament.id,
			userId: soloPlayerId(),
		});
		const rosterIds = [teamOwnerId(), teamMemberId(), soloPlayerId()].sort(
			(a, b) => a - b,
		);

		const response = await registrationAction(
			{
				_action: "UPSERT_REGISTRATION",
				tournamentTeamId: team.id,
				linkedTeam: false,
				pickUpName: "Looking Team",
				logo: null,
				teamId: null,
				ownerId: String(teamOwnerId()),
				members: rosterIds.map(userMember),
				mapPool: [],
			} as any,
			{ user: organizerId(), params: { id: String(tournament.id) } },
		);
		expect(response.status).toBe(302);
		expect(response.headers.get("Location")).not.toContain("__error");

		const teams = await TournamentRepository.findTeamsFullByTournamentId(
			tournament.id,
		);
		expect(
			teams
				.find((candidate) => candidate.id === team.id)
				?.members.map((member) => member.userId)
				.sort((a, b) => a - b),
		).toEqual(rosterIds);

		const groups = (
			await TournamentLFGRepository.findLookingTeamsByTournamentId(
				tournament.id,
			)
		).map((group) => ({
			isPlaceholder: Boolean(group.isPlaceholder),
			memberIds: group.members.map((member) => member.id).sort((a, b) => a - b),
		}));
		expect(groups).toEqual([{ isPlaceholder: false, memberIds: rosterIds }]);
	});
});
