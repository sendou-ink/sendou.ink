import { Outlet, useLoaderData } from "@remix-run/react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { Badge } from "~/components/Badge";
import { LinkButton } from "~/components/Button";
import { useHasPermission, useHasRole } from "~/modules/permissions/hooks";
import type { SerializeFrom } from "~/utils/remix";
import { badgeExplanationText } from "../badges-utils";

import { loader } from "../loaders/badges.$id.server";
export { loader };

export interface BadgeDetailsContext {
	badge: SerializeFrom<typeof loader>["badge"];
}

export default function BadgeDetailsPage() {
	const isStaff = useHasRole("STAFF");
	const data = useLoaderData<typeof loader>();
	const { t } = useTranslation("badges");

	const canManageBadge = useHasPermission(data.badge, "MANAGE");

	const context: BadgeDetailsContext = { badge: data.badge };

	const badgeMaker = () => {
		if (data.badge.author?.username) return data.badge.author?.username;
		if (
			[
				"XP3500 (Splatoon 3)",
				"XP4000 (Splatoon 3)",
				"XP4500 (Splatoon 3)",
				"XP5000 (Splatoon 3)",
			].includes(data.badge.displayName)
		) {
			return "Dreamy";
		}

		return "borzoic";
	};

	return (
		<div className="stack md items-center">
			<Outlet context={context} />
			<Badge badge={data.badge} isAnimated size={200} />
			<div>
				<div className="badges__explanation">
					{badgeExplanationText(t, data.badge)}
				</div>
				<div className="badges__managers">
					{t("managedBy", {
						users:
							data.badge.managers.map((m) => m.username).join(", ") || "???",
					})}{" "}
					(
					{t("madeBy", {
						user: badgeMaker(),
					})}
					)
				</div>
			</div>
			{isStaff || canManageBadge ? (
				<LinkButton to="edit" variant="outlined" size="tiny">
					Edit
				</LinkButton>
			) : null}
			<div className="badges__owners-container">
				<ul className="badges__owners">
					{data.badge.owners.map((owner) => (
						<li key={owner.id}>
							<span
								className={clsx("badges__count", {
									invisible: owner.count <= 1,
								})}
							>
								×{owner.count}
							</span>
							<span>{owner.username}</span>
						</li>
					))}
				</ul>
			</div>
		</div>
	);
}
