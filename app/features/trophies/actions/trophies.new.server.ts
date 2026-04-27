import type { ActionFunction } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import { clearTrophiesCache } from "~/features/trophies/loaders/trophies.server";
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
			}

			return null;
		}
		default: {
			assertUnreachable(data);
		}
	}
};
