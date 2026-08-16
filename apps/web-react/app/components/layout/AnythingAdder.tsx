import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { newArtPage } from "~/features/art/art-urls";
import { useUser } from "~/features/auth/core/user";
import { lfgNewPostPage } from "~/features/lfg/lfg-urls";
import { plusSuggestionsNewPage } from "~/features/plus-suggestions/plus-suggestions-urls";
import { canAccessTrophies } from "~/features/trophies/trophies-utils";
import { userNewBuildPage } from "~/features/user-page/user-page-urls";
import { newVodPage } from "~/features/vods/vods-urls";
import {
	CALENDAR_NEW_PAGE,
	NEW_TEAM_PAGE,
	NEW_TROPHY_PAGE,
	navIconUrl,
	newAssociationsPage,
	newScrimPostPage,
	ORGANIZATION_NEW_PAGE,
	TOURNAMENT_NEW_PAGE,
} from "~/utils/urls";
import { SendouButton } from "../elements/Button";
import {
	SendouMenu,
	SendouMenuItem,
	type SendouMenuItemProps,
} from "../elements/Menu";

export function AnythingAdder({ compact }: { compact?: boolean }) {
	const { t } = useTranslation(["common"]);
	const user = useUser();

	if (!user) {
		return null;
	}

	const items: Array<SendouMenuItemProps> = [
		{
			id: "tournament",
			children: t("header.adder.tournament"),
			imagePath: navIconUrl("medal"),
			href: TOURNAMENT_NEW_PAGE,
		},
		{
			id: "organization",
			children: t("header.adder.organization"),
			imagePath: navIconUrl("medal"),
			href: ORGANIZATION_NEW_PAGE,
		},
		{
			id: "calendarEvent",
			children: t("header.adder.calendarEvent"),
			imagePath: navIconUrl("calendar"),
			href: CALENDAR_NEW_PAGE,
		},
		{
			id: "builds",
			children: t("header.adder.build"),
			imagePath: navIconUrl("builds"),
			href: userNewBuildPage(user),
		},
		{
			id: "team",
			children: t("header.adder.team"),
			imagePath: navIconUrl("t"),
			href: NEW_TEAM_PAGE,
		},
		{
			id: "scrimPost",
			children: t("header.adder.scrimPost"),
			imagePath: navIconUrl("scrims"),
			href: newScrimPostPage(),
		},
		{
			id: "association",
			children: t("header.adder.association"),
			imagePath: navIconUrl("associations"),
			href: newAssociationsPage(),
		},
		{
			id: "lfgPost",
			children: t("header.adder.lfgPost"),
			imagePath: navIconUrl("lfg"),
			href: lfgNewPostPage(),
		},
		{
			id: "art",
			children: t("header.adder.art"),
			imagePath: navIconUrl("art"),
			href: newArtPage(),
		},
		{
			id: "vods",
			children: t("header.adder.vod"),
			imagePath: navIconUrl("vods"),
			href: newVodPage(),
		},
		{
			id: "plus",
			children: t("header.adder.plusSuggestion"),
			imagePath: navIconUrl("plus"),
			href: plusSuggestionsNewPage(),
		},
		canAccessTrophies(user)
			? {
					id: "trophy",
					children: t("header.adder.trophy"),
					imagePath: navIconUrl("trophies"),
					href: NEW_TROPHY_PAGE,
				}
			: null,
	].filter((item) => item !== null);

	return (
		<SendouMenu
			placement="bottom right"
			trigger={
				<SendouButton
					size="small"
					icon={<Plus />}
					shape={compact ? "square" : undefined}
					data-testid="anything-adder-menu-button"
				>
					{compact ? undefined : `${t("common:actions.addNew")}…`}
				</SendouButton>
			}
		>
			{items.map((item) => (
				<SendouMenuItem
					key={item.id}
					data-testid={`menu-item-${item.id}`}
					{...item}
				/>
			))}
		</SendouMenu>
	);
}
