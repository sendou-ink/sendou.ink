import * as UserReportRepository from "~/features/user-report/UserReportRepository.server";
import { USER_REPORT_CATEGORIES } from "~/features/user-report/user-report-constants";
import { backdate } from "../core/backdate";
import { defineFactory } from "../core/defineFactory";
import { faker } from "../core/faker";

type Options = {
	/** When the report was made, for one that should look older than now. */
	createdAt?: Date;
};

/** Creates user reports: `reporterUserId` reporting `reportedUserId`. */
export const { create } = defineFactory({
	defaults: () => ({
		category: faker.helpers.arrayElement(USER_REPORT_CATEGORIES),
		description: faker.lorem.sentences({ min: 1, max: 3 }),
		matchId: null,
	}),
	insert: UserReportRepository.upsert,
	applyOptions: async (report, { createdAt }: Options) => {
		await backdate("UserReport", report.id, { createdAt });
	},
});
