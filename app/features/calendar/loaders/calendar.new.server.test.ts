import { beforeEach, describe, expect, test } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentOrganizationFactory from "~/db/seed/factories/TournamentOrganizationFactory";
import * as TournamentStaffFactory from "~/db/seed/factories/TournamentStaffFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { wrappedLoader } from "~/utils/Test";
import { CALENDAR_NEW_PAGE } from "~/utils/urls";
import { calendarNewSearchParams } from "../calendar-search-params";
import { loader } from "./calendar.new.server";

const calendarNewLoader = wrappedLoader<Awaited<ReturnType<typeof loader>>>({
	loader,
});

const users = UserFactory.pool();

const orgOwnerId = () => users.id(1);
const staffId = () => users.id(2);

describe("calendar new loader: copying a tournament", () => {
	beforeEach(async () => {
		await users.create(2);
		await UserFactory.grant(staffId(), { patronTier: 2 });
	});

	test("does not prefill an organization the user can't add events for", async () => {
		const org = await TournamentOrganizationFactory.create(
			{ ownerId: orgOwnerId() },
			{ isEstablished: true },
		);
		const tournament = await TournamentFactory.create({
			authorId: orgOwnerId(),
			organizationId: org.id,
		});
		await TournamentStaffFactory.create({
			tournamentId: tournament.id,
			userId: staffId(),
			role: "ORGANIZER",
		});

		const data = await calendarNewLoader({
			user: staffId(),
			url: calendarNewSearchParams.href(CALENDAR_NEW_PAGE, {
				copyEventId: tournament.eventId,
			}),
		});
		if (data instanceof Response) throw new Error("expected loader data");

		const prefilledOrganizationId = data.eventToCopy?.organization?.id ?? null;
		const selectableOrganizationIds = data.organizations.flatMap((option) =>
			typeof option === "string" ? [] : [option.id],
		);

		expect(data.eventToCopy).toBeDefined();
		expect(
			prefilledOrganizationId === null ||
				selectableOrganizationIds.includes(prefilledOrganizationId),
		).toBe(true);
	});
});
