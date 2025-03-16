import { useNavigate } from "@remix-run/react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useUser } from "~/features/auth/core/user";
import {
	CALENDAR_NEW_PAGE,
	NEW_TEAM_PAGE,
	TOURNAMENT_NEW_PAGE,
	lfgNewPostPage,
	navIconUrl,
	newArtPage,
	newVodPage,
	plusSuggestionsNewPage,
	userNewBuildPage,
} from "~/utils/urls";
import { Menu, type MenuProps } from "../Menu";
import { PlusIcon } from "../icons/Plus";

const FilterMenuButton = React.forwardRef<
	HTMLButtonElement,
	React.ButtonHTMLAttributes<HTMLButtonElement>
>((props, ref) => {
	return (
		<button
			className="layout__header__button"
			{...props}
			ref={ref}
			data-testid="anything-adder-menu-button"
		>
			<PlusIcon className="layout__header__button__icon" />
		</button>
	);
});

export function AnythingAdder() {
	const { t } = useTranslation(["common"]);
	const user = useUser();
	const navigate = useNavigate();

	if (!user) {
		return null;
	}

	const items: MenuProps["items"] = [
		{
			id: "tournament",
			text: t("header.adder.tournament"),
			imagePath: navIconUrl("medal"),
			onClick: () => navigate(TOURNAMENT_NEW_PAGE),
		},
		{
			id: "calendarEvent",
			text: t("header.adder.calendarEvent"),
			imagePath: navIconUrl("calendar"),
			onClick: () => navigate(CALENDAR_NEW_PAGE),
		},
		{
			id: "builds",
			text: t("header.adder.build"),
			imagePath: navIconUrl("builds"),
			onClick: () => navigate(userNewBuildPage(user)),
		},
		{
			id: "team",
			text: t("header.adder.team"),
			imagePath: navIconUrl("t"),
			onClick: () => navigate(NEW_TEAM_PAGE),
		},
		{
			id: "lfgPost",
			text: t("header.adder.lfgPost"),
			imagePath: navIconUrl("lfg"),
			onClick: () => navigate(lfgNewPostPage()),
		},
		{
			id: "art",
			text: t("header.adder.art"),
			imagePath: navIconUrl("art"),
			onClick: () => navigate(newArtPage()),
		},
		{
			id: "vods",
			text: t("header.adder.vod"),
			imagePath: navIconUrl("vods"),
			onClick: () => navigate(newVodPage()),
		},
		{
			id: "plus",
			text: t("header.adder.plusSuggestion"),
			imagePath: navIconUrl("plus"),
			onClick: () => navigate(plusSuggestionsNewPage()),
		},
	];

	return <Menu items={items} button={FilterMenuButton} opensLeft />;
}
