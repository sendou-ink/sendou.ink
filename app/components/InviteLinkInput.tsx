import { Check, Clipboard } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { SendouButton } from "~/components/elements/Button";
import { Label } from "~/components/Label";
import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";
import styles from "./InviteLinkInput.module.css";

/** A labeled read-only invite link with a copy to clipboard button. */
export function InviteLinkInput({
	link,
	label,
}: {
	link: string;
	/** Overrides the default "Invite link" label. */
	label?: string;
}) {
	const { t } = useTranslation(["common"]);
	const id = React.useId();
	const { copyToClipboard, copySuccess } = useCopyToClipboard();

	return (
		<div>
			<Label htmlFor={id}>{label ?? t("common:inviteLink")}</Label>
			<div className={styles.row}>
				<input
					type="text"
					value={link}
					readOnly
					id={id}
					onFocus={(e) => e.currentTarget.select()}
					data-testid="invite-link-input"
				/>
				<SendouButton
					shape="square"
					variant={copySuccess ? "outlined-success" : "outlined"}
					onPress={() => copyToClipboard(link)}
					icon={copySuccess ? <Check /> : <Clipboard />}
					aria-label={t("common:actions.copyToClipboard")}
					data-testid="copy-invite-link-button"
				/>
			</div>
		</div>
	);
}
