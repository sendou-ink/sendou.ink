import { REGULAR_USER_TEST_ID } from "~/db/seed/constants";
import * as TeamFactory from "~/db/seed/factories/TeamFactory";
import { ADMIN_ID } from "~/features/admin/admin-constants";

/** A team the regular user owns, so acting as "regular" exercises the owner paths. */
export const createTeamOwnedByRegular = (name: string, isMainTeam = true) =>
	TeamFactory.create({
		name,
		isMainTeam,
		memberUserIds: [REGULAR_USER_TEST_ID],
	});

/** A team the regular user is a member but not the owner of. */
export const createTeamWithRegularMember = (
	overrides: Partial<Parameters<typeof TeamFactory.create>[0]> = {},
) =>
	TeamFactory.create({
		memberUserIds: [ADMIN_ID, REGULAR_USER_TEST_ID],
		...overrides,
	});
