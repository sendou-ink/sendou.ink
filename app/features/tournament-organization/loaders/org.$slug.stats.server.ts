import { addMonths, format, startOfMonth, subMonths } from "date-fns";
import type { LoaderFunctionArgs } from "react-router";
import * as R from "remeda";
import { requirePermission } from "~/modules/permissions/guards.server";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import * as TournamentOrganizationRepository from "../TournamentOrganizationRepository.server";
import {
	ESTABLISHED_ORG,
	MONTH_PARAM_FORMAT,
} from "../tournament-organization-constants";
import { organizationFromParams } from "../tournament-organization-utils.server";

export async function loader({ params }: LoaderFunctionArgs) {
	const organization = await organizationFromParams(params);

	requirePermission(organization, "EDIT");

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

	const averageMonthlyParticipants = R.mean(monthlyCounts) ?? 0;

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
