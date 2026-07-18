import { isSameMonth, startOfMonth, subMonths } from "date-fns";
import type { LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import * as UserReportRepository from "~/features/user-report/UserReportRepository.server";
import { requireRole } from "~/modules/permissions/guards.server";
import { databaseTimestampToDate } from "~/utils/dates";
import { logger } from "~/utils/logger";
import { notFoundIfFalsy } from "~/utils/remix.server";
import { convertSnowflakeToDate } from "~/utils/users";

const REPORT_GRAPH_MONTHS = 12;

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const loggedInUser = requireUser();

	requireRole("STAFF");

	const user = notFoundIfFalsy(
		await UserRepository.findLayoutDataByIdentifier(params.identifier!),
	);

	logger.info(
		`User ${loggedInUser.username} (#${loggedInUser.id}) is viewing admin tab for user ${user.username} (#${user.id})`,
	);

	const userData = notFoundIfFalsy(
		await UserRepository.findModInfoById(user.id),
	);

	const friendCodes = await UserRepository.friendCodesByUserId(user.id);

	const reports = await UserReportRepository.findAllByReportedUserId(user.id);

	return {
		...userData,
		discordId: user.discordId,
		discordAccountCreatedAt: convertSnowflakeToDate(user.discordId).getTime(),
		friendCodes,
		reports,
		reportsMonthlyCounts: reportsMonthlyCounts(reports),
	};
};

function reportsMonthlyCounts(
	reports: Awaited<
		ReturnType<typeof UserReportRepository.findAllByReportedUserId>
	>,
) {
	const now = new Date();

	return Array.from({ length: REPORT_GRAPH_MONTHS }, (_, i) => {
		const month = startOfMonth(subMonths(now, REPORT_GRAPH_MONTHS - 1 - i));

		return {
			month: month.getTime(),
			count: reports.filter((report) =>
				isSameMonth(databaseTimestampToDate(report.createdAt), month),
			).length,
		};
	});
}
