import { useTranslation } from "react-i18next";
import { SUPPORT_PAGE } from "~/utils/urls";
import { LinkButton } from "../elements/Button";
import { HeartIcon } from "../icons/Heart";
import { AnythingAdder } from "./AnythingAdder";
import { CommandPalette } from "./CommandPalette";
import styles from "./TopRightButtons.module.css";

export function TopRightButtons({
	showSupport,
	openNavDialog: _openNavDialog,
}: {
	showSupport: boolean;
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
			<CommandPalette />
			<AnythingAdder />
			{/** xxx: delete this? */}
			{/* <button
				aria-label="Open navigation"
				onClick={openNavDialog}
				className={styles.button}
				type="button"
			>
				<HamburgerIcon className={styles.buttonIcon} />
			</button> */}
		</div>
	);
}
