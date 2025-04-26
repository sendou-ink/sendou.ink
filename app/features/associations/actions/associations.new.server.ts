import { type ActionFunctionArgs, redirect } from "@remix-run/node";
import { ASSOCIATION } from "~/features/associations/associations-constants";
import { createNewAssociationSchema } from "~/features/associations/associations-schemas";
import { requireUser } from "~/features/auth/core/user.server";
import { actionError, parseRequestPayload } from "~/utils/remix.server";
import { associationsPage } from "~/utils/urls";
import * as AssociationRepository from "../AssociationRepository.server";

export const action = async ({ request }: ActionFunctionArgs) => {
	const user = await requireUser(request);
	const data = await parseRequestPayload({
		request,
		schema: createNewAssociationSchema,
	});

	const associationCount = (
		await AssociationRepository.findByMemberUserId(user.id)
	).actual;
	const maxAssociationCount = user.roles.includes("SUPPORTER")
		? ASSOCIATION.MAX_COUNT_SUPPORTER
		: ASSOCIATION.MAX_COUNT_REGULAR_USER;

	if (associationCount.length >= maxAssociationCount) {
		return actionError<typeof createNewAssociationSchema>({
			msg: `Regular users can only be a member of ${maxAssociationCount} associations (supporters ${ASSOCIATION.MAX_COUNT_SUPPORTER})`,
			field: "name",
		});
	}

	await AssociationRepository.insert({
		name: data.name,
		userId: user.id,
	});

	return redirect(associationsPage());
};
