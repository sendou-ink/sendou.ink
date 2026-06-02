import type { ActionFunction } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as ShowcaseTournaments from "~/features/front-page/core/ShowcaseTournaments.server";
import {
	clearTournamentDataCache,
	tournamentFromDB,
} from "~/features/tournament-bracket/core/Tournament.server";
import {
	errorToastIfFalsy,
	parseParams,
	parseRequestPayload,
	successToast,
} from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { idObject } from "../../../utils/zod";
import * as TournamentRepository from "../TournamentRepository.server";
import { adminStaffActionSchema } from "../tournament-schemas.server";

export const action: ActionFunction = async ({ request, params }) => {
	const user = requireUser();
	const data = await parseRequestPayload({
		request,
		schema: adminStaffActionSchema,
	});

	const { id: tournamentId } = parseParams({
		params,
		schema: idObject,
	});
	const tournament = await tournamentFromDB({ tournamentId, user });

	const validateIsTournamentAdmin = () =>
		errorToastIfFalsy(tournament.isAdmin(user), "Unauthorized");

	let message: string;
	switch (data._action) {
		case "ADD_STAFF": {
			validateIsTournamentAdmin();

			errorToastIfFalsy(
				tournament.ctx.staff.every((staff) => staff.id !== data.userId),
				"User is already a staff member",
			);

			await TournamentRepository.addStaff({
				role: data.role,
				tournamentId: tournament.ctx.id,
				userId: data.userId,
			});

			if (data.role === "ORGANIZER") {
				ShowcaseTournaments.addToCached({
					tournamentId,
					type: "organizer",
					userId: data.userId,
				});
			}

			message = "Staff member added";
			break;
		}
		case "REMOVE_STAFF": {
			validateIsTournamentAdmin();

			await TournamentRepository.removeStaff({
				tournamentId: tournament.ctx.id,
				userId: data.userId,
			});

			ShowcaseTournaments.removeFromCached({
				tournamentId,
				type: "organizer",
				userId: data.userId,
			});

			message = "Staff member removed";
			break;
		}
		default: {
			assertUnreachable(data);
		}
	}

	clearTournamentDataCache(tournamentId);

	return successToast(message);
};
