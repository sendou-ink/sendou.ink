import type { ActionFunction } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import { clearTrophiesCache } from "~/features/trophies/loaders/trophies.server";
import { parseFormData } from "~/form/parse.server";
import { errorToastIfFalsy, parseRequestPayload } from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import * as TrophyRepository from "../TrophyRepository.server";
import { TROPHY_PENDING_PER_USER_LIMIT } from "../trophies-constants";
import {
	createTrophyFormSchema,
	pendingTrophyActionSchema,
} from "../trophies-schemas";
import { canReviewTrophies, compressTrophyModel } from "../trophies-utils";

export const action: ActionFunction = async ({ request }) => {
	const user = requireUser();

	const isJson = request.headers.get("Content-Type") === "application/json";

	if (isJson) {
		const result = await parseFormData({
			request,
			schema: createTrophyFormSchema,
		});

		if (!result.success) {
			return { fieldErrors: result.fieldErrors };
		}

		const [pendingCount, nameExists] = await Promise.all([
			TrophyRepository.unreviewedCountBySubmitter(user.id),
			TrophyRepository.existsByName(result.data.name),
		]);

		errorToastIfFalsy(
			pendingCount < TROPHY_PENDING_PER_USER_LIMIT,
			"Pending trophy limit reached",
		);

		if (nameExists) {
			return {
				fieldErrors: { name: "forms:errors.trophyNameTaken" },
			};
		}

		await TrophyRepository.createPending({
			name: result.data.name,
			model: compressTrophyModel(result.data.model),
			description: result.data.description ?? "",
			organizationId: result.data.organizationId,
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
				!pending.acceptedAt,
				"Cannot decline an accepted trophy",
			);

			await TrophyRepository.declinePending({
				id: data.pendingTrophyId,
				reason: data.reason,
				declinedByUserId: user.id,
			});
			return null;
		}
		case "ACCEPT": {
			errorToastIfFalsy(canReviewTrophies(user), "Not allowed");

			const pending = await TrophyRepository.findPendingById(
				data.pendingTrophyId,
			);
			errorToastIfFalsy(pending, "Pending trophy not found");
			errorToastIfFalsy(!pending.declinedAt, "Cannot accept a declined trophy");
			errorToastIfFalsy(!pending.acceptedAt, "Trophy is already accepted");

			const inserted = await TrophyRepository.acceptPending({
				id: data.pendingTrophyId,
				acceptedByUserId: user.id,
			});
			errorToastIfFalsy(inserted, "Failed to accept trophy");

			clearTrophiesCache();
			return null;
		}
		default: {
			assertUnreachable(data);
		}
	}
};
