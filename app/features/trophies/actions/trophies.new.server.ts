import type { ActionFunction } from "react-router";
import { ADMIN_ID, QA_IDS, STAFF_IDS } from "~/features/admin/admin-constants";
import {
	type AuthenticatedUser,
	requireUser,
} from "~/features/auth/core/user.server";
import { notify } from "~/features/notifications/core/notify.server";
import { clearTrophiesCache } from "~/features/trophies/loaders/trophies.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { parseFormData } from "~/form/parse.server";
import { errorToastIfFalsy, parseRequestPayload } from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import * as TrophyRepository from "../TrophyRepository.server";
import {
	TROPHY_APPROVALS_REQUIRED,
	TROPHY_PENDING_PER_USER_LIMIT,
} from "../trophies-constants";
import {
	pendingTrophyActionSchema,
	trophyFormSchema,
} from "../trophies-schemas";
import {
	canEditTrophy,
	canReviewTrophies,
	compressTrophyModel,
} from "../trophies-utils";

export const action: ActionFunction = async ({ request }) => {
	const user = requireUser();

	const isJson = request.headers.get("Content-Type") === "application/json";

	if (isJson) {
		const result = await parseFormData({
			request,
			schema: trophyFormSchema,
		});

		if (!result.success) {
			return { fieldErrors: result.fieldErrors };
		}

		const data = result.data;

		const pendingCount = await TrophyRepository.unreviewedCountBySubmitter(
			user.id,
		);
		errorToastIfFalsy(
			pendingCount < TROPHY_PENDING_PER_USER_LIMIT,
			"Pending trophy limit reached",
		);

		if (data._action === "UPDATE") {
			const trophy = await TrophyRepository.findById(data.targetTrophyId);
			errorToastIfFalsy(trophy, "Trophy not found");
			errorToastIfFalsy(
				canEditTrophy(user, { managerId: trophy.manager?.id ?? null }),
				"Not allowed",
			);

			const nameExists = await TrophyRepository.existsByName({
				name: data.name,
				excludeTrophyId: data.targetTrophyId,
			});
			if (nameExists) {
				return { fieldErrors: { name: "forms:errors.trophyNameTaken" } };
			}

			await TrophyRepository.createPending({
				name: data.name,
				model: compressTrophyModel(data.model),
				description: data.description ?? "",
				organizationId: data.organizationId,
				submitterUserId: user.id,
				targetTrophyId: data.targetTrophyId,
				managerId: data.managerId,
			});

			await notifyReviewersOfSubmission({
				trophyName: data.name,
				submitter: user,
			});

			return null;
		}

		const nameExists = await TrophyRepository.existsByName({
			name: data.name,
		});
		if (nameExists) {
			return { fieldErrors: { name: "forms:errors.trophyNameTaken" } };
		}

		await TrophyRepository.createPending({
			name: data.name,
			model: compressTrophyModel(data.model),
			description: data.description ?? "",
			organizationId: data.organizationId,
			submitterUserId: user.id,
		});

		await notifyReviewersOfSubmission({
			trophyName: data.name,
			submitter: user,
		});

		return null;
	}

	const data = await parseRequestPayload({
		request,
		schema: pendingTrophyActionSchema,
	});

	switch (data._action) {
		case "DELETE": {
			const pending = await TrophyRepository.findPendingById(
				data.pendingTrophyId,
			);
			errorToastIfFalsy(pending, "Pending trophy not found");

			const isOwner = pending.submitterUserId === user.id;
			const canReview = canReviewTrophies(user);
			errorToastIfFalsy(isOwner || canReview, "Not allowed");

			await TrophyRepository.deletePending(data.pendingTrophyId);
			return null;
		}
		case "DECLINE": {
			errorToastIfFalsy(canReviewTrophies(user), "Not allowed");

			const pending = await TrophyRepository.findPendingById(
				data.pendingTrophyId,
			);
			errorToastIfFalsy(pending, "Pending trophy not found");
			errorToastIfFalsy(!pending.declinedAt, "Trophy is already declined");
			errorToastIfFalsy(
				pending.approvals.length < TROPHY_APPROVALS_REQUIRED,
				"Cannot decline an accepted trophy",
			);

			await TrophyRepository.declinePending({
				id: data.pendingTrophyId,
				reason: data.reason,
				declinedByUserId: user.id,
			});

			if (pending.submitterUserId !== user.id) {
				notify({
					userIds: [pending.submitterUserId],
					notification: {
						type: "TROPHY_SUBMISSION_DECLINED",
						meta: { trophyName: pending.name },
					},
				});
			}

			return null;
		}
		case "APPROVE": {
			errorToastIfFalsy(canReviewTrophies(user), "Not allowed");

			const pending = await TrophyRepository.findPendingById(
				data.pendingTrophyId,
			);

			errorToastIfFalsy(pending, "Pending trophy not found");
			errorToastIfFalsy(
				!pending.declinedAt,
				"Cannot approve a declined trophy",
			);
			errorToastIfFalsy(
				pending.approvals.length < TROPHY_APPROVALS_REQUIRED,
				"Trophy is already accepted",
			);
			errorToastIfFalsy(
				!pending.approvals.some((a) => a.userId === user.id),
				"Already approved",
			);

			const inserted = await TrophyRepository.addApproval({
				pendingTrophyId: data.pendingTrophyId,
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
			}

			return null;
		}
		default: {
			assertUnreachable(data);
		}
	}
};

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
