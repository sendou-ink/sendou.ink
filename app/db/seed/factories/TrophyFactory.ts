import { db } from "~/db/sql";
import type { TablesInsertable } from "~/db/tables";
import type { TournamentTierNumber } from "~/features/tournament/core/tiering";
import * as TrophyRepository from "~/features/trophies/TrophyRepository.server";
import { defineFactory } from "../core/defineFactory";
// the e2e process loads this factory as plain ESM, where the attribute is required
import trophies from "../data/trophies.json" with { type: "json" };

/** Compressed model states of real trophies, one of which every trophy is given. */
export const MODELS = Object.values(trophies);

type Win = {
	userId: number;
	tournamentId: number;
	tier?: TournamentTierNumber | null;
};

type Options = {
	/** Tournaments the trophy has been won in, one row per winner of each. */
	wins?: Win[];
};

/**
 * Creates trophies. A trophy only comes into existence in production once a
 * submission has gathered its approvals, which `createPending` covers — one that
 * merely has to exist is written directly.
 */
export const { create, createMany } = defineFactory({
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
	applyOptions: async (trophy, { wins }: Options) => {
		if (!wins?.length) return;

		// written directly because production awards a trophy only by finalizing the
		// tournament it was the prize of, which `TournamentFactory` plays out
		await db
			.insertInto("TrophyOwner")
			.values(
				wins.map((win) => ({
					trophyId: trophy.id,
					userId: win.userId,
					tournamentId: win.tournamentId,
					tier: win.tier ?? null,
				})),
			)
			.execute();
	},
});

type PendingOptions = {
	/** Who approves the submission; enough of them and the trophy is created. */
	approverUserIds?: number[];
	/** Who turns the submission down, and why. */
	declinedBy?: { userId: number; reason: string };
};

/**
 * Creates trophy submissions awaiting review. The options review the submission the
 * way the review page does, so one can be brought to any point of its life.
 */
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
