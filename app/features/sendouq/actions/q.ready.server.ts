import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as SQGroupRepository from "~/features/sendouq/SQGroupRepository.server";
import { parseRequestPayload } from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { SENDOUQ_LOOKING_PAGE, sendouQMatchPage } from "~/utils/urls";
import * as ReadyCheck from "../core/ready-check.server";
import { SendouQ } from "../core/SendouQ.server";
import { readySchema } from "../q-action-schemas";
import { SendouQError } from "../q-utils.server";

export const action = async ({ request }: ActionFunctionArgs) => {
	const user = requireUser();
	const data = await parseRequestPayload({
		request,
		schema: readySchema,
	});

	const ownGroup = SendouQ.findOwnGroup(user.id);
	if (!ownGroup) return null;

	try {
		switch (data._action) {
			case "CONFIRM_READY": {
				const readyCheck = await SQGroupRepository.findReadyCheckByGroupId(
					ownGroup.id,
				);
				if (!readyCheck) return null;

				if (ReadyCheck.hasExpired(readyCheck)) {
					await ReadyCheck.expire(readyCheck);

					throw redirect(SENDOUQ_LOOKING_PAGE);
				}

				const matchId = await ReadyCheck.confirm({
					readyCheck,
					userId: user.id,
				});

				if (matchId) {
					throw redirect(sendouQMatchPage(matchId));
				}

				return null;
			}
			default: {
				assertUnreachable(data._action);
			}
		}
	} catch (error) {
		// e.g. the ready check was resolved by someone else's request in the
		// meantime. return null so loaders re-run and the user sees the fresh state
		if (error instanceof SendouQError) {
			return null;
		}

		throw error;
	}
};
