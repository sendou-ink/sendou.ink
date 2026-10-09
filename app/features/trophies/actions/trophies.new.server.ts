import * as v from "valibot";
import { ADMIN_ID, QA_IDS } from "~/features/admin/admin-constants";
import {
	type AuthenticatedUser,
	requireUser,
} from "~/features/auth/core/user.server";
import * as ShowcaseTournaments from "~/features/front-page/core/ShowcaseTournaments.server";
import { notify } from "~/features/notifications/core/notify.server";
import { resolveNotifications } from "~/features/notifications/core/resolve.server";
import { clearTrophiesCache } from "~/features/trophies/loaders/trophies.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { defineAction } from "~/form/define-action.server";
import { requirePermission } from "~/modules/permissions/guards.server";
import { ConcurrentModificationError } from "~/utils/errors";
import { logger } from "~/utils/logger";
import {
	errorToast,
	errorToastIfFalsy,
	successToast,
} from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { stripDisabledEffects } from "../core/model-analysis";
import * as TrophyBackfill from "../core/TrophyBackfill.server";
import * as TrophyRepository from "../TrophyRepository.server";
import { TROPHY_PENDING_PER_USER_LIMIT } from "../trophies-constants";
import { trophyActionSchema, trophyFormSchema } from "../trophies-schemas";
import {
	canBackfillTrophies,
	canReviewTrophies,
	compressTrophyModel,
} from "../trophies-utils";

export const action = defineAction(
	{
		body: v.variant("_action", [
			trophyFormSchema,
			...trophyActionSchema.options,
		]),
	},
	async ({ body }) => {
		const user = requireUser();

		if (body._action === "CREATE" || body._action === "UPDATE") {
			const pendingCount = await TrophyRepository.unreviewedCountBySubmitter(
				user.id,
			);
			errorToastIfFalsy(
				pendingCount < TROPHY_PENDING_PER_USER_LIMIT,
				"Pending trophy limit reached",
			);

			if (body._action === "UPDATE") {
				const trophy = await TrophyRepository.findById(body.targetTrophyId);
				errorToastIfFalsy(trophy, "Trophy not found");
				requirePermission(trophy, "EDIT");

				const nameExists = await TrophyRepository.existsByName({
					name: body.name,
					excludeTrophyId: body.targetTrophyId,
				});
				if (nameExists) {
					return { fieldErrors: { name: "forms:errors.trophyNameTaken" } };
				}

				await TrophyRepository.createPending({
					name: body.name,
					model: compressTrophyModel(stripDisabledEffects(body.model)),
					description: body.description ?? "",
					organizationId: body.organizationId,
					submitterUserId: user.id,
					targetTrophyId: body.targetTrophyId,
					managerId: body.managerId,
					creatorId: body.creatorId ?? undefined,
				});

				await notifyReviewersOfSubmission({
					trophyName: body.name,
					submitter: user,
				});

				return null;
			}

			const nameExists = await TrophyRepository.existsByName({
				name: body.name,
			});
			if (nameExists) {
				return { fieldErrors: { name: "forms:errors.trophyNameTaken" } };
			}

			await TrophyRepository.createPending({
				name: body.name,
				model: compressTrophyModel(stripDisabledEffects(body.model)),
				description: body.description ?? "",
				organizationId: body.organizationId,
				submitterUserId: user.id,
				creatorId: body.creatorId ?? user.id,
			});

			await notifyReviewersOfSubmission({
				trophyName: body.name,
				submitter: user,
			});

			return null;
		}

		switch (body._action) {
			case "DELETE": {
				const pending = await TrophyRepository.findPendingById(
					body.pendingTrophyId,
				);
				errorToastIfFalsy(pending, "Pending trophy not found");

				const isOwner = pending.submitterUserId === user.id;
				const canReview = canReviewTrophies(user);
				errorToastIfFalsy(isOwner || canReview, "Not allowed");

				await TrophyRepository.deletePending(body.pendingTrophyId);

				await resolveSubmittedNotification(pending.name);
				return null;
			}
			case "DECLINE": {
				errorToastIfFalsy(canReviewTrophies(user), "Not allowed");

				const pending = await TrophyRepository.findPendingById(
					body.pendingTrophyId,
				);
				errorToastIfFalsy(pending, "Pending trophy not found");
				errorToastIfFalsy(!pending.declinedAt, "Trophy is already declined");
				errorToastIfFalsy(
					!pending.acceptedAt,
					"Cannot decline an accepted trophy",
				);

				const declined = await TrophyRepository.declinePending({
					id: body.pendingTrophyId,
					reason: body.reason,
					declinedByUserId: user.id,
				});
				errorToastIfFalsy(declined, "Cannot decline an accepted trophy");

				if (pending.submitterUserId !== user.id) {
					notify({
						userIds: [pending.submitterUserId],
						notification: {
							type: "TROPHY_SUBMISSION_DECLINED",
							meta: { trophyName: pending.name },
						},
					});
				}

				await resolveSubmittedNotification(pending.name);

				return null;
			}
			case "APPROVE": {
				errorToastIfFalsy(canReviewTrophies(user), "Not allowed");

				const pending = await TrophyRepository.findPendingById(
					body.pendingTrophyId,
				);

				errorToastIfFalsy(pending, "Pending trophy not found");
				errorToastIfFalsy(
					!pending.declinedAt,
					"Cannot approve a declined trophy",
				);
				errorToastIfFalsy(!pending.acceptedAt, "Trophy is already accepted");
				errorToastIfFalsy(
					!pending.approvals.some((a) => a.userId === user.id),
					"Already approved",
				);

				const inserted = await TrophyRepository.addApproval({
					pendingTrophyId: body.pendingTrophyId,
					userId: user.id,
				});

				if (inserted) {
					clearTrophiesCache();

					if (pending.submitterUserId !== user.id) {
						notify({
							userIds: [pending.submitterUserId],
							notification: {
								type: "TROPHY_SUBMISSION_ACCEPTED",
								meta: { trophyName: pending.name, trophyId: inserted.id },
							},
						});
					}

					await resolveSubmittedNotification(pending.name);
				} else {
					// still needs approvals from the other reviewers
					await resolveNotifications({
						userIds: [user.id],
						type: "TROPHY_SUBMITTED",
						meta: { trophyName: pending.name },
					});
				}

				return null;
			}
			case "BACKFILL": {
				errorToastIfFalsy(canBackfillTrophies(user), "Not allowed");

				const trophy = await TrophyRepository.findById(body.trophyId);
				errorToastIfFalsy(trophy, "Trophy not found");
				errorToastIfFalsy(trophy.organizationId, "Trophy has no organization");

				const tournaments = await TrophyBackfill.backfillableTournaments({
					organizationId: trophy.organizationId,
					seriesId: body.seriesId,
				});
				errorToastIfFalsy(tournaments, "Series not found");

				const awards = body.awards.map((award) => {
					const tournament = tournaments.find(
						(candidate) => candidate.tournamentId === award.tournamentId,
					);
					errorToastIfFalsy(tournament, "Tournament can't be backfilled");
					errorToastIfFalsy(
						award.userIds.every((userId) =>
							tournament.winners.some((winner) => winner.id === userId),
						),
						"Only the winners of a tournament can receive its trophy",
					);

					return {
						tournamentId: award.tournamentId,
						tournamentTeamId: tournament.tournamentTeamId,
						userIds: award.userIds,
					};
				});

				try {
					await TrophyRepository.backfill({ trophyId: trophy.id, awards });
				} catch (error) {
					if (error instanceof ConcurrentModificationError) {
						errorToast("A tournament got a trophy in the meantime, try again");
					}
					throw error;
				}

				logger.info(
					`Trophy ${trophy.id} backfilled by user ${user.id}: ${JSON.stringify(awards)}`,
				);

				clearTrophiesCache();
				ShowcaseTournaments.clearCachedTournaments();

				return successToast(
					`${trophy.name} awarded for ${awards.length} tournament(s)`,
				);
			}
			default: {
				assertUnreachable(body);
			}
		}
	},
);

function resolveSubmittedNotification(trophyName: string) {
	return resolveNotifications({
		userIds: [ADMIN_ID, ...QA_IDS],
		type: "TROPHY_SUBMITTED",
		meta: { trophyName },
	});
}

async function notifyReviewersOfSubmission({
	trophyName,
	submitter,
}: {
	trophyName: string;
	submitter: AuthenticatedUser;
}) {
	const reviewerIds = await UserRepository.existingUserIds(
		[ADMIN_ID, ...QA_IDS].filter((id) => id !== submitter.id),
	);

	notify({
		userIds: reviewerIds,
		notification: {
			type: "TROPHY_SUBMITTED",
			meta: { trophyName, submitterUsername: submitter.username },
		},
	});
}
