import type { MetaFunction, SerializeFrom } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { useTranslation } from "react-i18next";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { Main } from "~/components/Main";
import { SendouButton } from "~/components/elements/Button";
import { UnlinkIcon } from "~/components/icons/Unlink";
import { useUser } from "~/features/auth/core/user";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	navIconUrl,
	topSearchPage,
	topSearchPlayerPage,
	userPage,
} from "~/utils/urls";
import { PlacementsTable } from "../components/Placements";

import { action } from "../actions/xsearch.player.$id.server";
import { loader } from "../loaders/xsearch.player.$id.server";
export { loader, action };

import "../top-search.css";

export const handle: SendouRouteHandle = {
	breadcrumb: ({ match }) => {
		const data = match.data as SerializeFrom<typeof loader> | undefined;

		if (!data) return [];

		const firstName = data.placements[0].name;

		return [
			{
				imgPath: navIconUrl("xsearch"),
				href: topSearchPage(),
				type: "IMAGE",
			},
			{
				text: firstName,
				type: "TEXT",
				href: topSearchPlayerPage(data.placements[0].playerId),
			},
		];
	},
};

export const meta: MetaFunction<typeof loader> = (args) => {
	if (!args.data) return [];

	const aliasesStr =
		args.data.names.aliases.length > 0
			? ` (Aliases: ${args.data.names.aliases.join(", ")})`
			: "";

	return metaTags({
		title: `${args.data.names.primary} X Battle Top 500 Placements`,
		description: `Splatoon 3 X Battle results for the player ${args.data.names.primary}${aliasesStr}`,
		location: args.location,
	});
};

export default function XSearchPlayerPage() {
	const { t } = useTranslation(["common"]);
	const data = useLoaderData<typeof loader>();
	const user = useUser();

	const hasUserLinked = Boolean(data.placements[0].discordId);

	const isLinkedToCurrentUser =
		user && user?.discordId === data.placements[0].discordId;

	return (
		<Main halfWidth className="stack lg">
			<div>
				<h2 className="text-lg">
					{hasUserLinked ? (
						<Link to={userPage(data.placements[0])}>{data.names.primary}</Link>
					) : (
						<>{data.names.primary}</>
					)}{" "}
					{t("common:xsearch.placements")}
				</h2>
				{data.names.aliases.length > 0 ? (
					<div className="text-lighter text-sm">
						{t("common:xsearch.aliases")} {data.names.aliases.join(", ")}
					</div>
				) : null}
			</div>
			<PlacementsTable placements={data.placements} type="MODE_INFO" />
			{isLinkedToCurrentUser ? <UnlinkFormWithButton /> : null}
		</Main>
	);
}

function UnlinkFormWithButton() {
	const { t } = useTranslation(["common"]);

	return (
		<FormWithConfirm
			dialogHeading={t("common:xsearch.unlink.title")}
			deleteButtonText={t("common:xsearch.unlink.action.short")}
		>
			<SendouButton
				icon={<UnlinkIcon />}
				variant="destructive"
				size="miniscule"
				className="mt-2 self-start"
			>
				{t("common:xsearch.unlink.action.long")}
			</SendouButton>
		</FormWithConfirm>
	);
}
