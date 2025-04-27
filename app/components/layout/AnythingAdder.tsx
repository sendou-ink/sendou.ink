import { Button } from "react-aria-components";
import { useTranslation } from "react-i18next";
import { useUser } from "~/features/auth/core/user";
import { FF_SCRIMS_ENABLED } from "~/features/scrims/scrims-constants";
import {
	CALENDAR_NEW_PAGE,
	NEW_TEAM_PAGE,
	TOURNAMENT_NEW_PAGE,
	lfgNewPostPage,
	navIconUrl,
	newArtPage,
	newAssociationsPage,
	newScrimPostPage,
	newVodPage,
	plusSuggestionsNewPage,
	userNewBuildPage,
} from "~/utils/urls";
import {
	SendouMenu,
	SendouMenuItem,
	type SendouMenuItemProps,
} from "../elements/Menu";
import { PlusIcon } from "../icons/Plus";

export function AnythingAdder() {
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
		FF_SCRIMS_ENABLED
			? {
					id: "scrimPost",
					children: t("header.adder.scrimPost"),
					imagePath: navIconUrl("scrims"),
					href: newScrimPostPage(),
				}
			: null,
		FF_SCRIMS_ENABLED
			? {
					id: "association",
					children: t("header.adder.association"),
					imagePath: navIconUrl("associations"),
					href: newAssociationsPage(),
				}
			: null,
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
	].filter((item) => item !== null);

	return (
		<SendouMenu
			trigger={
				<Button
					className="layout__header__button"
					data-testid="anything-adder-menu-button"
				>
					<PlusIcon className="layout__header__button__icon" />
				</Button>
			}
		>
			{items.map((item) => (
				<SendouMenuItem key={item.id} {...item} />
			))}
		</SendouMenu>
	);
}
