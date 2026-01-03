import { type ActionFunctionArgs, redirect } from "react-router";
import { createNewAssociationSchema } from "~/features/associations/associations-schemas";
import { requireUser } from "~/features/auth/core/user.server";
import { parseFormData } from "~/form/parse.server";
import { associationsPage } from "~/utils/urls";
import * as AssociationRepository from "../AssociationRepository.server";

export const action = async ({ request }: ActionFunctionArgs) => {
	const user = await requireUser(request);
	const result = await parseFormData({
		request,
		schema: createNewAssociationSchema,
	});

	// xxx: do in middleware or something
	if (!result.success) {
		return { fieldErrors: result.fieldErrors };
	}

	await AssociationRepository.insert({
		name: result.data.name,
		userId: user.id,
	});

	return redirect(associationsPage());
};
