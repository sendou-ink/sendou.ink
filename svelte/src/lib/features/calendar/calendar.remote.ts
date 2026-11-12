import { error } from "@sveltejs/kit";
import { query } from "$app/server";
import * as Badges from "~/features/badges/core/Badges.server";
import { findValidOrganizations } from "~/features/calendar/calendar-organizations.server";
import { requireUser } from "#lib/server/shims/user.server.ts";

/** What the new calendar event form offers to pick from: the user's organizations and the badges they manage. */
export const getCalendarNewOptions = query(async () => {
	const user = requireUser();
	if (!user.roles.includes("CALENDAR_EVENT_ADDER")) error(403, "Forbidden");

	const organizations = await findValidOrganizations(
		user.id,
		user.roles.includes("TOURNAMENT_ADDER"),
	);

	return {
		badgeOptions: await Badges.attachable({ managerIds: [user.id], attached: [] }),
		hasOrganizations: organizations.length > 0,
		organizationOptions: organizations.flatMap((org) =>
			typeof org === "string" ? [] : [{ value: String(org.id), label: org.name }],
		),
	};
});
