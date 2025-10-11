import { sub } from "date-fns";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { logger } from "~/utils/logger";
import { db } from "../db/sql";
import { notify } from "../features/notifications/core/notify.server";
import { Routine } from "./routine.server";

export const CloseExpiredCommissionsRoutine = new Routine({
	name: "CloseExpiredCommissions",
	func: async () => {
		const usersWithExpiredCommissions = await db
			.selectFrom("User")
			.select(["id", "discordId"])
			.where("commissionsOpen", "=", 1)
			.where("commissionsOpenedAt", "is not", null)
			.where(
				"commissionsOpenedAt",
				"<=",
				dateToDatabaseTimestamp(sub(new Date(), { months: 1 })),
			)
			.execute();

		if (usersWithExpiredCommissions.length === 0) {
			return;
		}

		const userIds = usersWithExpiredCommissions.map((user) => user.id);

		await db
			.updateTable("User")
			.set({
				commissionsOpen: 0,
				commissionsOpenedAt: null,
			})
			.where("id", "in", userIds)
			.execute();

		logger.info(
			`Closed commissions for ${usersWithExpiredCommissions.length} users`,
		);

		for (const user of usersWithExpiredCommissions) {
			await notify({
				notification: {
					type: "COMMISSIONS_CLOSED",
					meta: {
						discordId: user.discordId,
					},
				},
				userIds: [user.id],
			});
		}
	},
});
