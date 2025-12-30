import { useTranslation } from "react-i18next";
import { SUPPORT_PAGE } from "~/utils/urls";
import { LinkButton } from "../elements/Button";
import { HamburgerIcon } from "../icons/Hamburger";
import { HeartIcon } from "../icons/Heart";
import { AnythingAdder } from "./AnythingAdder";
import { NotificationPopover } from "./NotificationPopover";
import styles from "./TopRightButtons.module.css";
import { UserItem } from "./UserItem";

export function TopRightButtons({
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
		<div className={styles.container}>
			{showSupport ? (
				<LinkButton
					to={SUPPORT_PAGE}
					size="small"
					icon={<HeartIcon />}
					variant="outlined"
				>
					{t("common:pages.support")}
				</LinkButton>
			) : null}
			<NotificationPopover />
			<AnythingAdder />
			<button
				aria-label="Open navigation"
				onClick={openNavDialog}
				className={styles.button}
				type="button"
			>
				<HamburgerIcon className={styles.buttonIcon} />
			</button>
			{!isErrored ? <UserItem className={styles.userItem} /> : null}
		</div>
	);
}
