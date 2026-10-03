import { db } from "~/db/sql";
import * as ModAuditLogRepository from "~/features/admin/ModAuditLogRepository.server";
import { actAs } from "../core/actAs";
import { backdate } from "../core/backdate";
import { defineFactory } from "../core/defineFactory";
import { faker } from "../core/faker";

type InsertArgs = Parameters<typeof ModAuditLogRepository.insert>[0] & {
	/** Author of the text */
	userId: number;
};

type Options = {
	/** When the text was written, for one that should look older than now. */
	createdAt?: Date;
};

/** Logs a text written by `userId` for moderators to review. */
export const { create } = defineFactory({
	defaults: () => ({
		type: "SENDOUQ_PUBLIC_NOTE" as const,
		text: faker.lorem.sentence(),
	}),
	insert: ({ userId, ...args }: InsertArgs) =>
		actAs(userId, () =>
			db
				.transaction()
				.execute((trx) => ModAuditLogRepository.insert(args, trx)),
		),
	applyOptions: async (row, { createdAt }: Options) => {
		await backdate("ModAuditLog", row.id, { createdAt });
	},
});
