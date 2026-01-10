import { Heart, LogIn } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SUPPORT_PAGE } from "~/utils/urls";
import { LinkButton, SendouButton } from "../elements/Button";
import { AnythingAdder } from "./AnythingAdder";
import { CommandPalette } from "./CommandPalette";
import { LogInButtonContainer } from "./LogInButtonContainer";
import styles from "./TopRightButtons.module.css";

export function TopRightButtons({
	showSupport,
	showSearch,
	isLoggedIn,
	openNavDialog: _openNavDialog,
}: {
	showSupport: boolean;
	showSearch: boolean;
	isLoggedIn: boolean;
	openNavDialog: () => void;
}) {
	const { t } = useTranslation(["common", "front"]);

	return (
		<div className={styles.container}>
			{showSupport ? (
				<LinkButton
					to={SUPPORT_PAGE}
					size="small"
					icon={<Heart />}
					variant="outlined"
				>
					{t("common:pages.support")}
				</LinkButton>
			) : null}
			{isLoggedIn ? (
				<>
					{showSearch ? <CommandPalette /> : null}
					<AnythingAdder />
				</>
			) : (
				<LogInButtonContainer>
					<SendouButton type="submit" size="small" icon={<LogIn />}>
						{t("front:mobileNav.login")}
					</SendouButton>
				</LogInButtonContainer>
			)}
		</div>
	);
}
