import * as v from "valibot";
import { action as adminAction } from "~/features/tournament-admin/actions/to.$id.admin.seeds.server";
import { defineAction } from "~/form/define-action.server";
import { RENDERS_FIELD_ERRORS_KEY } from "~/form/utils";
import { id, idObject } from "~/utils/schema";
import { wrapActionForApi } from "../api-action-wrapper.server";

const bodySchema = v.object({
	tournamentTeamIds: v.array(id),
});

export const action = defineAction(
	{ params: idObject, body: bodySchema, onInvalidBody: "badRequest" },
	async ({ params: { id: tournamentId }, body, ...args }) => {
		const internalRequest = new Request(args.request.url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				_action: "UPDATE_SEEDS",
				seeds: body.tournamentTeamIds,
				[RENDERS_FIELD_ERRORS_KEY]: true,
			}),
		});

		return wrapActionForApi(() =>
			adminAction({
				...args,
				params: { id: String(tournamentId) },
				request: internalRequest,
			}),
		);
	},
);
