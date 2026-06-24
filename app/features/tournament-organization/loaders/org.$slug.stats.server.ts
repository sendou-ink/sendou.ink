import { addMonths, format, startOfMonth, subMonths } from "date-fns";
import type { LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import * as TournamentOrganizationRepository from "../TournamentOrganizationRepository.server";
import {
	ESTABLISHED_ORG,
	MONTH_PARAM_FORMAT,
} from "../tournament-organization-constants";
import { organizationFromParams } from "../tournament-organization-utils.server";

export async function loader({ params }: LoaderFunctionArgs) {
	const organization = await organizationFromParams(params);

	const user = requireUser();
	const isOrgAdmin = organization.members.some(
		(member) => member.id === user.id && member.role === "ADMIN",
	);

	if (!isOrgAdmin) {
		throw new Response("Forbidden", { status: 403 });
	}

	const fullMonths = recentFullMonths(ESTABLISHED_ORG.MONTHS_CONSIDERED);

	const monthlyCounts = await Promise.all(
		fullMonths.map((month) =>
			TournamentOrganizationRepository.countActiveParticipants({
				organizationId: organization.id,
				startTime: dateToDatabaseTimestamp(month),
				endTime: dateToDatabaseTimestamp(addMonths(month, 1)),
			}),
		),
	);

	const monthlyStats = fullMonths.map((month, index) => ({
		month: format(month, MONTH_PARAM_FORMAT),
		count: monthlyCounts[index],
	}));

	const averageMonthlyParticipants =
		monthlyCounts.reduce((sum, count) => sum + count, 0) /
		ESTABLISHED_ORG.MONTHS_CONSIDERED;

	return {
		monthlyStats,
		averageMonthlyParticipants,
	};
}

/** The `count` most recent full months
 * (excluding the current month), most recent first. */
function recentFullMonths(count: number) {
	const months: Date[] = [];
	const thisMonthStart = startOfMonth(new Date());

	for (let index = 0; index < count; index++) {
		months.push(subMonths(thisMonthStart, index + 1));
	}

	return months;
}
