import type { ActionFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { parseFormData } from "~/form/parse.server";
import {
	errorToastIfFalsy,
	notFoundIfFalsy,
	parseParams,
} from "~/utils/remix.server";
import { sendUserReportWebhook } from "../core/discord-webhook.server";
import * as UserReportRepository from "../UserReportRepository.server";
import {
	reportUserParamsSchema,
	reportUserSchema,
} from "../user-report-schemas";

export const action = async ({ request, params }: ActionFunctionArgs) => {
	const user = requireUser();

	const reportedUserId = parseParams({
		params,
		schema: reportUserParamsSchema,
	}).id;

	errorToastIfFalsy(reportedUserId !== user.id, "Can't report yourself");

	const reportedUser = notFoundIfFalsy(
		await UserRepository.findLeanById(reportedUserId),
	);

	const result = await parseFormData({ request, schema: reportUserSchema });
	if (!result.success) {
		return { fieldErrors: result.fieldErrors };
	}

	const { isUpdate } = await UserReportRepository.upsert({
		reportedUserId,
		reporterUserId: user.id,
		category: result.data.category,
		description: result.data.description,
	});

	const reportCounts =
		await UserReportRepository.countRecentByReportedUserId(reportedUserId);

	sendUserReportWebhook({
		reportedUser,
		reporter: user,
		category: result.data.category,
		description: result.data.description,
		isUpdate,
		reportCounts,
	});

	return null;
};
