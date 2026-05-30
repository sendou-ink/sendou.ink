import type { LoaderFunctionArgs } from "react-router";
import { getUser } from "~/features/auth/core/user.server";
import * as SavedCalendarEventRepository from "~/features/tournament/SavedCalendarEventRepository.server";
import { parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/zod";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const user = getUser();
	const { id: tournamentId } = parseParams({
		params,
		schema: idObject,
	});

	if (!user) {
		return { isSaved: false };
	}

	return {
		isSaved: await SavedCalendarEventRepository.isSaved({
			userId: user.id,
			tournamentId,
		}),
	};
};
