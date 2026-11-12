import { addDays } from "date-fns";
import { beforeEach, describe, expect, test } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentLFGTeamFactory from "~/db/seed/factories/TournamentLFGTeamFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import * as TournamentLFGRepository from "~/features/tournament-lfg/TournamentLFGRepository.server";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { wrappedAction } from "~/utils/Test";
import type { adminRegistrationFormSchema } from "../tournament-admin-registration-schemas";
import { action } from "./to.$id.admin.registration.server";

const adminRegistration = wrappedAction<typeof adminRegistrationFormSchema>({
	action,
	isJsonSubmission: true,
});

const users = UserFactory.pool();

const organizerId = () => users.id(1);
const teamOwnerId = () => users.id(2);
const teamMemberId = () => users.id(3);
const soloPlayerId = () => users.id(4);

describe("admin registration action", () => {
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

		const response = await adminRegistration(
			{
				_action: "UPSERT_REGISTRATION",
				tournamentTeamId: team.id,
				linkedTeam: false,
				pickUpName: "Looking Team",
				logo: null,
				teamId: null,
				ownerId: String(teamOwnerId()),
				members: rosterIds.map((userId) => ({
					userId,
					inGameName: null,
					tournamentName: null,
				})),
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
