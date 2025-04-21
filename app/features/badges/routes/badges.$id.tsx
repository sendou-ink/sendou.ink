import { Outlet, useLoaderData, useMatches, useParams } from "@remix-run/react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { Badge } from "~/components/Badge";
import { LinkButton } from "~/components/Button";
import { Redirect } from "~/components/Redirect";
import { useUser } from "~/features/auth/core/user";
import { useHasRole } from "~/modules/permissions/hooks";
import { canEditBadgeOwners } from "~/permissions";
import { BADGES_PAGE } from "~/utils/urls";
import { badgeExplanationText } from "../badges-utils";
import type { BadgesLoaderData } from "../loaders/badges.server";

import { loader } from "../loaders/badges.$id.server";
export { loader };

export interface BadgeDetailsContext {
	badgeName: string;
}

export default function BadgeDetailsPage() {
	const user = useUser();
	const isStaff = useHasRole("STAFF");
	const [, parentRoute] = useMatches();
	const { badges } = parentRoute.data as BadgesLoaderData;
	const params = useParams();
	const data = useLoaderData<typeof loader>();
	const { t } = useTranslation("badges");

	const badge = badges.find((b) => b.id === Number(params.id));
	if (!badge) return <Redirect to={BADGES_PAGE} />;

	const context: BadgeDetailsContext = { badgeName: badge.displayName };

	const badgeMaker = () => {
		if (badge.author?.username) return badge.author?.username;
		if (
			[
				"XP3500 (Splatoon 3)",
				"XP4000 (Splatoon 3)",
				"XP4500 (Splatoon 3)",
				"XP5000 (Splatoon 3)",
			].includes(badge.displayName)
		) {
			return "Dreamy";
		}

		return "borzoic";
	};

	return (
		<div className="stack md items-center">
			<Outlet context={context} />
			<Badge badge={badge} isAnimated size={200} />
			<div>
				<div className="badges__explanation">
					{badgeExplanationText(t, badge)}
				</div>
				<div className="badges__managers">
					{t("managedBy", {
						users: data.managers.map((m) => m.username).join(", ") || "???",
					})}{" "}
					(
					{t("madeBy", {
						user: badgeMaker(),
					})}
					)
				</div>
			</div>
			{isStaff || canEditBadgeOwners({ user, managers: data.managers }) ? (
				<LinkButton to="edit" variant="outlined" size="tiny">
					Edit
				</LinkButton>
			) : null}
			<div className="badges__owners-container">
				<ul className="badges__owners">
					{data.owners.map((owner) => (
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
