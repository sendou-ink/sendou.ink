import * as AssociationRepository from "~/features/associations/AssociationRepository.server";
import { defineFactory } from "../core/defineFactory";
import { faker } from "../core/faker";

type Options = {
	/** Members besides the owner, who is an admin of the association regardless. */
	memberUserIds?: number[];
	/** Members who can also share the association's invite link. */
	managerUserIds?: number[];
};

/** Creates associations. `userId` is the owner, added as its admin by the repository. */
export const { create } = defineFactory({
	defaults: () => ({
		name: faker.company.name(),
	}),
	insert: AssociationRepository.insert,
	applyOptions: async (
		association,
		{ memberUserIds, managerUserIds }: Options,
	) => {
		for (const userId of [
			...(memberUserIds ?? []),
			...(managerUserIds ?? []),
		]) {
			await AssociationRepository.insertMember({
				associationId: association.id,
				userId,
			});
		}

		for (const userId of managerUserIds ?? []) {
			await AssociationRepository.updateMemberRole({
				associationId: association.id,
				userId,
				role: "MANAGER",
			});
		}
	},
});
