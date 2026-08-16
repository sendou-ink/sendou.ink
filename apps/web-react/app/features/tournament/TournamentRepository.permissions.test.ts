import { beforeEach, describe, expect, test } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentOrganizationFactory from "~/db/seed/factories/TournamentOrganizationFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import invariant from "~/utils/invariant";
import * as TournamentRepository from "./TournamentRepository.server";

const users = UserFactory.pool();

const authorId = () => users.id(1);
const orgAdminId = () => users.id(2);
const orgOrganizerId = () => users.id(3);
const orgStreamerId = () => users.id(4);
const staffOrganizerId = () => users.id(5);
const staffStreamerId = () => users.id(6);
const outsiderId = () => users.id(7);

type Members = NonNullable<
	Parameters<typeof TournamentOrganizationFactory.create>[1]
>["members"];
type Staff = Parameters<typeof TournamentRepository.setStaff>[0]["staff"];
type Grant = Parameters<typeof UserFactory.grant>[1];

const permissionsOfTournament = async ({
	members,
	staff,
	isEstablished = false,
	withOrganization = true,
}: {
	members?: Members;
	staff?: Staff;
	isEstablished?: boolean;
	withOrganization?: boolean;
} = {}) => {
	const organization = withOrganization
		? await TournamentOrganizationFactory.create(
				{ ownerId: orgAdminId() },
				{ members, isEstablished },
			)
		: null;

	const tournament = await TournamentFactory.create({
		authorId: authorId(),
		organizationId: organization?.id ?? null,
	});

	if (staff?.length) {
		await TournamentRepository.setStaff({
			tournamentId: tournament.id,
			staff,
		});
	}

	const found = await TournamentRepository.findById(tournament.id);
	invariant(found, "Expected to find the tournament");

	return found.permissions;
};

describe("TournamentRepository.findById", () => {
	beforeEach(async () => {
		await users.create(7);
	});

	test("author of an organization-less tournament holds every permission but the in-game names one", async () => {
		const permissions = await permissionsOfTournament({
			withOrganization: false,
		});

		expect(permissions).toEqual({
			ADMIN: [authorId()],
			ORGANIZE: [authorId()],
			MANAGE_MATCHES: [authorId()],
			EDIT_EVENT_INFO: [authorId()],
			EDIT_IN_GAME_NAMES: [],
		});
	});

	test("organization and staff roles cascade into the wider permissions", async () => {
		const permissions = await permissionsOfTournament({
			members: [
				{ userId: orgOrganizerId(), role: "ORGANIZER" },
				{ userId: orgStreamerId(), role: "STREAMER" },
			],
			staff: [
				{ userId: staffOrganizerId(), role: "ORGANIZER" },
				{ userId: staffStreamerId(), role: "STREAMER" },
			],
		});

		expect(permissions.ADMIN.sort()).toEqual([authorId(), orgAdminId()].sort());
		expect(permissions.ORGANIZE.sort()).toEqual(
			[authorId(), orgAdminId(), orgOrganizerId(), staffOrganizerId()].sort(),
		);
		expect(permissions.MANAGE_MATCHES.sort()).toEqual(
			[
				authorId(),
				orgAdminId(),
				orgOrganizerId(),
				staffOrganizerId(),
				orgStreamerId(),
				staffStreamerId(),
			].sort(),
		);
		expect(permissions.MANAGE_MATCHES).not.toContain(outsiderId());
	});

	test.each<{ why: string; isEstablished: boolean; grant: Grant }>([
		{
			why: "the organization is established",
			isEstablished: true,
			grant: {},
		},
		{
			why: "they may add tournaments of their own anyway",
			isEstablished: false,
			grant: { roles: ["TOURNAMENT_ORGANIZER"] },
		},
		{
			why: "they are a supporter",
			isEstablished: false,
			grant: { patronTier: 2 },
		},
	])(
		"organization admin may edit the event info when $why",
		async ({ isEstablished, grant }) => {
			await UserFactory.grant(orgAdminId(), grant);

			const permissions = await permissionsOfTournament({ isEstablished });

			expect(permissions.EDIT_EVENT_INFO.sort()).toEqual(
				[authorId(), orgAdminId()].sort(),
			);
		},
	);

	test("organization admin of an unestablished organization may not edit the event info", async () => {
		const permissions = await permissionsOfTournament({ isEstablished: false });

		expect(permissions.EDIT_EVENT_INFO).toEqual([authorId()]);
	});

	test("organization organizer may not edit the event info", async () => {
		const permissions = await permissionsOfTournament({
			isEstablished: true,
			members: [{ userId: orgOrganizerId(), role: "ORGANIZER" }],
		});

		expect(permissions.EDIT_EVENT_INFO).not.toContain(orgOrganizerId());
	});

	test("in-game names may be edited by the admins and organizers of an established organization", async () => {
		const permissions = await permissionsOfTournament({
			isEstablished: true,
			members: [
				{ userId: orgOrganizerId(), role: "ORGANIZER" },
				{ userId: orgStreamerId(), role: "STREAMER" },
			],
			staff: [{ userId: staffOrganizerId(), role: "ORGANIZER" }],
		});

		expect(permissions.EDIT_IN_GAME_NAMES.sort()).toEqual(
			[orgAdminId(), orgOrganizerId()].sort(),
		);
	});

	test("in-game names may not be edited when the organization is not established", async () => {
		const permissions = await permissionsOfTournament({
			isEstablished: false,
			members: [{ userId: orgOrganizerId(), role: "ORGANIZER" }],
		});

		expect(permissions.EDIT_IN_GAME_NAMES).toEqual([]);
	});
});
