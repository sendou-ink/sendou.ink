import { LogIn } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SendouButton } from "./elements/Button";
import { SendouPopover } from "./elements/Popover";
import styles from "./LogInPopover.module.css";
import { LogInButtonContainer } from "./layout/LogInButtonContainer";

/** Wraps a trigger a logged out user can't use, prompting them to log in instead. */
export function LogInPopover({
	children,
}: {
	children: React.ReactElement<Record<string, unknown>>;
}) {
	const { t } = useTranslation(["common"]);

	return (
		<SendouPopover trigger={children} popoverClassName={styles.popover}>
			<div className={styles.text}>{t("common:logInPrompt")}</div>
			<LogInButtonContainer>
				<SendouButton
					type="submit"
					size="small"
					icon={<LogIn />}
					data-testid="log-in-popover-button"
				>
					{t("common:header.login.discord")}
				</SendouButton>
			</LogInButtonContainer>
		</SendouPopover>
	);
}
