import { db } from "~/db/sql";
import type { TablesInsertable } from "~/db/tables";
import * as TrophyRepository from "~/features/trophies/TrophyRepository.server";
import { defineFactory } from "../core/defineFactory";
// the e2e process loads this factory as plain ESM, where the attribute is required
import trophies from "../data/trophies.json" with { type: "json" };

/** Compressed model states of real trophies, one of which every trophy is given. */
export const MODELS = Object.values(trophies);

/** Written directly; `createPending` covers the submission flow. Awarding is `TournamentFactory`'s job (finalizing). */
export const { create } = defineFactory({
	defaults: ({ seq }) => ({
		name: `Trophy ${seq}`,
		model: MODELS[seq % MODELS.length],
		code: null,
		organizationId: null,
		creatorId: null,
		managerId: null,
	}),
	insert: (args: TablesInsertable["Trophy"]) =>
		db
			.insertInto("Trophy")
			.values(args)
			.returning("id")
			.executeTakeFirstOrThrow(),
});

type PendingOptions = {
	/** Who approves the submission; enough of them and the trophy is created. */
	approverUserIds?: number[];
	/** Who turns the submission down, and why. */
	declinedBy?: { userId: number; reason: string };
};

/** Submissions awaiting review; the options review them the way the review page does. */
export const { create: createPending, createMany: createManyPending } =
	defineFactory({
		defaults: ({ seq }) => ({
			name: `Pending trophy ${seq}`,
			model: MODELS[seq % MODELS.length],
			description: "",
		}),
		insert: TrophyRepository.createPending,
		applyOptions: async (
			pending,
			{ approverUserIds, declinedBy }: PendingOptions,
		) => {
			for (const userId of approverUserIds ?? []) {
				await TrophyRepository.addApproval({
					pendingTrophyId: pending.id,
					userId,
				});
			}

			if (declinedBy) {
				await TrophyRepository.declinePending({
					id: pending.id,
					reason: declinedBy.reason,
					declinedByUserId: declinedBy.userId,
				});
			}
		},
	});
