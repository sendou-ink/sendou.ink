import type { LoaderFunctionArgs } from "@remix-run/node";
import { requireUserId } from "~/features/auth/core/user.server";
import type { SerializeFrom } from "~/utils/remix";
import { parseSafeSearchParams } from "~/utils/remix.server";
import { inviteCodeObject } from "~/utils/zod";
import * as AssociationRepository from "../AssociationRepository.server";

export type AssociationsLoaderData = SerializeFrom<typeof loader>;

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = await requireUserId(request);

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
	const searchParams = parseSafeSearchParams({
		request,
		schema: inviteCodeObject,
	});

	if (!searchParams.success) return null;

	const associationToJoin = await AssociationRepository.findByInviteCode(
		searchParams.data.inviteCode,
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
		inviteCode: searchParams.data.inviteCode,
	};
}
