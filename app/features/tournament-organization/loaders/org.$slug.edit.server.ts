import type { LoaderFunctionArgs } from "react-router";
import * as Badges from "~/features/badges/core/Badges.server";
import { requirePermission } from "~/modules/permissions/guards.server";
import { organizationFromParams } from "../tournament-organization-utils.server";

export async function loader({ params }: LoaderFunctionArgs) {
	const organization = await organizationFromParams(params);

	requirePermission(organization, "EDIT");

	return {
		organization,
		badgeOptions: await Badges.attachable({
			managerIds: organization.members.map((member) => member.id),
			attached: organization.badges,
		}),
	};
}
