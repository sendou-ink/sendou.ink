import { redirect } from "react-router";
import { createNewAssociationSchema } from "~/features/associations/associations-schemas";
import { associationsPage } from "~/features/associations/associations-urls";
import { requireUser } from "~/features/auth/core/user.server";
import { defineAction } from "~/form/define-action.server";
import { LimitReachedError } from "~/utils/errors";
import * as AssociationRepository from "../AssociationRepository.server";

export const action = defineAction(
	{ body: createNewAssociationSchema },
	async ({ body }) => {
		const user = requireUser();

		try {
			await AssociationRepository.insert({
				name: body.name,
				userId: user.id,
			});
		} catch (error) {
			if (error instanceof LimitReachedError) {
				return {
					fieldErrors: { name: "forms:errors.maxAssociationsReached" },
				};
			}
			throw error;
		}

		return redirect(associationsPage());
	},
);
