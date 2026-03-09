import type { LoaderFunctionArgs } from "react-router";
import * as BadgeRepository from "~/features/badges/BadgeRepository.server";
import { requirePermission } from "~/modules/permissions/guards.server";
import { organizationFromParams } from "../tournament-organization-utils.server";

export async function loader({ params }: LoaderFunctionArgs) {
	const organization = await organizationFromParams(params);

	requirePermission(organization, "EDIT");

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
