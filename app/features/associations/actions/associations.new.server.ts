import { type ActionFunctionArgs, redirect } from "react-router";
import { createNewAssociationSchema } from "~/features/associations/associations-schemas";
import { requireUser } from "~/features/auth/core/user.server";
import { parseFormData } from "~/form/parse.server";
import { LimitReachedError } from "~/utils/errors";
import { associationsPage } from "~/utils/urls";
import * as AssociationRepository from "../AssociationRepository.server";

export const action = async ({ request }: ActionFunctionArgs) => {
	const user = requireUser();
	const result = await parseFormData({
		request,
		schema: createNewAssociationSchema,
	});

	if (!result.success) {
		return { fieldErrors: result.fieldErrors };
	}

	try {
		await AssociationRepository.insert({
			name: result.data.name,
			userId: user.id,
		});
	} catch (error) {
		if (error instanceof LimitReachedError) {
			return { fieldErrors: { name: "forms:errors.maxAssociationsReached" } };
		}
		throw error;
	}

	return redirect(associationsPage());
};
