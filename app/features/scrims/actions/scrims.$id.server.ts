import type { ActionFunctionArgs } from "@remix-run/node";
import { requirePermission } from "~/modules/permissions/guards.server";
import {
	notFoundIfFalsy,
	parseParams,
	parseRequestPayload,
} from "~/utils/remix.server";
import { idObject } from "~/utils/zod";
import { requireUser } from "../../auth/core/user.server";
import * as ScrimPostRepository from "../ScrimPostRepository.server";
import { cancelScrimSchema } from "../scrims-schemas";

export const action = async ({ request, params }: ActionFunctionArgs) => {
	const { id } = parseParams({ params, schema: idObject });
	const post = notFoundIfFalsy(await ScrimPostRepository.findById(id));

	const user = await requireUser(request);
	const data = await parseRequestPayload({
		request,
		schema: cancelScrimSchema,
	});

	requirePermission(post, "CANCEL", user);

	await ScrimPostRepository.cancelScrim(id, {
		userId: user.id,
		reason: data.reason,
	});

	return null;
};
