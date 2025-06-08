import type { LoaderFunctionArgs } from "@remix-run/node";
import { requireUser } from "~/features/auth/core/user.server";
import * as BadgeRepository from "~/features/badges/BadgeRepository.server";
import { requirePermission } from "~/modules/permissions/guards.server";
import { organizationFromParams } from "../tournament-organization-utils.server";

export async function loader({ params, request }: LoaderFunctionArgs) {
	const user = await requireUser(request);
	const organization = await organizationFromParams(params);

	requirePermission(organization, "EDIT", user);

	const badgeOptions = async () => {
		const result = await BadgeRepository.findByManagersList(
			organization.members.map((member) => member.id),
		);

		// handles edge case where the badge is not managed by the org anymore for whatever reason
		// -> let's still keep it still deletable
		for (const badge of organization.badges) {
			if (!result.find((b) => b.id === badge.id)) {
				result.push(badge);
			}
		}

		return result;
	};

	return {
		organization,
		badgeOptions: await badgeOptions(),
	};
}
