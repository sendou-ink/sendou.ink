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

	const associationsWithManagerData: Array<
		(typeof associations)[number] & {
			inviteCode: string | undefined;
			upcomingLimitedContentCount: number | undefined;
		}
	> = [];
	for (const association of associations) {
		associationsWithManagerData.push({
			...association,
			inviteCode: association.permissions.MANAGE_INVITE_LINK.includes(user.id)
				? await AssociationRepository.findInviteCodeById(association.id)
				: undefined,
			upcomingLimitedContentCount: association.permissions.MANAGE.includes(
				user.id,
			)
				? await AssociationRepository.countUpcomingContentLimitedTo(
						association.id,
					)
				: undefined,
		});
	}

	return {
		associations: associationsWithManagerData,
		toJoin: await associationToJoin(request, user.id),
	};
};

async function associationToJoin(
	request: LoaderFunctionArgs["request"],
	userId: number,
) {
	const { inviteCode } = associationsSearchParams.parse(request);

	if (!inviteCode) return null;

	const association = await AssociationRepository.findByInviteCode(inviteCode, {
		withMembers: true,
	});
	if (!association) return null;

	if (association.members!.some((member) => member.id === userId)) {
		return null;
	}

	return {
		association,
		inviteCode,
	};
}
