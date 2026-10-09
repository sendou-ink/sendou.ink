import { requireUser } from "~/features/auth/core/user.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { defineAction } from "~/form/define-action.server";
import { errorToastIfFalsy, notFoundIfNullish } from "~/utils/remix.server";
import { idObject } from "~/utils/schema";
import { sendUserReportWebhook } from "../core/discord-webhook.server";
import * as UserReportRepository from "../UserReportRepository.server";
import { reportUserSchemaServer } from "../user-report-schemas.server";

export const action = defineAction(
	{ params: idObject, body: reportUserSchemaServer },
	async ({ params: { id: reportedUserId }, body }) => {
		const user = requireUser();

		errorToastIfFalsy(reportedUserId !== user.id, "Can't report yourself");

		const reportedUser = notFoundIfNullish(
			await UserRepository.findLeanById(reportedUserId),
		);

		const { isUpdate } = await UserReportRepository.upsert({
			reportedUserId,
			reporterUserId: user.id,
			category: body.category,
			description: body.description,
			matchId: body.matchId,
		});

		const reportCounts =
			await UserReportRepository.countRecentByReportedUserId(reportedUserId);

		sendUserReportWebhook({
			reportedUser,
			reporter: user,
			category: body.category,
			description: body.description,
			matchId: body.matchId,
			isUpdate,
			reportCounts,
		});

		return null;
	},
);
