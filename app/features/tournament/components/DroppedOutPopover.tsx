import { LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import styles from "./DroppedOutPopover.module.css";

export function DroppedOutPopover() {
	const { t } = useTranslation(["tournament"]);

	return (
		<SendouPopover
			trigger={
				<SendouButton
					variant="minimal"
					shape="circle"
					className={styles.trigger}
					icon={<LogOut />}
					aria-label={t("tournament:team.droppedOut.header")}
				/>
			}
		>
			<div className={styles.content}>
				<div className="font-bold">
					{t("tournament:team.droppedOut.header")}
				</div>
				<div>{t("tournament:team.droppedOut.explanation")}</div>
			</div>
		</SendouPopover>
	);
}
