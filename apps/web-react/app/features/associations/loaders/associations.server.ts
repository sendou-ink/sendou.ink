import type { LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import type { SerializeFrom } from "~/utils/remix";
import * as AssociationRepository from "../AssociationRepository.server";
import { associationsSearchParams } from "../associations-search-params";

export type AssociationsLoaderData = SerializeFrom<typeof loader>;

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = requireUser();

	const associations = (
		await AssociationRepository.findByMemberUserId(user.id, {
			withMembers: true,
		})
	).actual;

	const associationsWithInviteCodes = await Promise.all(
		associations.map(async (association) => ({
			...association,
			inviteCode: association.permissions.MANAGE.includes(user.id)
				? await AssociationRepository.findInviteCodeById(association.id)
				: undefined,
		})),
	);

	return {
		associations: associationsWithInviteCodes,
		toJoin: await associationToJoin(request, user.id),
	};
};

async function associationToJoin(
	request: LoaderFunctionArgs["request"],
	userId: number,
) {
	const { inviteCode } = associationsSearchParams.parse(request);

	if (!inviteCode) return null;

	const associationToJoin = await AssociationRepository.findByInviteCode(
		inviteCode,
		{
			withMembers: true,
		},
	);
	if (!associationToJoin) return null;

	if (associationToJoin.members!.some((member) => member.id === userId)) {
		return null;
	}

	return {
		association: associationToJoin,
		inviteCode,
	};
}
