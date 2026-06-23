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

	const finishedMonths = lastFinishedMonths(ESTABLISHED_ORG.MONTHS_CONSIDERED);

	const monthlyCounts = await Promise.all(
		finishedMonths.map((month) => countParticipants(organization.id, month)),
	);

	const monthlyStats = finishedMonths.map((month, index) => ({
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

function countParticipants(organizationId: number, monthStart: Date) {
	return TournamentOrganizationRepository.countActiveParticipants({
		organizationId,
		startTime: dateToDatabaseTimestamp(monthStart),
		endTime: dateToDatabaseTimestamp(addMonths(monthStart, 1)),
	});
}

/** The `count` most recently finished months
 * (excluding the current month), most recent first. */
function lastFinishedMonths(count: number) {
	const months: Date[] = [];
	const thisMonthStart = startOfMonth(new Date());

	for (let index = 0; index < count; index++) {
		months.push(subMonths(thisMonthStart, index + 1));
	}

	return months;
}
