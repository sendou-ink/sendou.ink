import * as React from "react";
import { useTranslation } from "react-i18next";
import { SUPPORT_PAGE } from "~/utils/urls";
import { LinkButton } from "../Button";
import { HamburgerIcon } from "../icons/Hamburger";
import { HeartIcon } from "../icons/Heart";
import { AnythingAdder } from "./AnythingAdder";
import { UserItem } from "./UserItem";

export function _TopRightButtons({
	showSupport,
	isErrored,
	openNavDialog,
}: {
	showSupport: boolean;
	isErrored: boolean;
	openNavDialog: () => void;
}) {
	const { t } = useTranslation(["common"]);

	return (
		<div className="layout__header__right-container">
			{showSupport ? (
				<LinkButton
					to={SUPPORT_PAGE}
					size="tiny"
					icon={<HeartIcon />}
					variant="outlined"
				>
					{t("common:pages.support")}
				</LinkButton>
			) : null}
			<AnythingAdder />
			<button
				aria-label="Open navigation"
				onClick={openNavDialog}
				className="layout__header__button"
				type="button"
			>
				<HamburgerIcon className="layout__header__button__icon" />
			</button>
			{!isErrored ? <UserItem /> : null}
		</div>
	);
}

export const TopRightButtons = React.memo(_TopRightButtons);
