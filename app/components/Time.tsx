import { useRef, useState } from "react";
import * as React from "react";
import { Dialog } from "react-aria-components";
import { Popover } from "react-aria-components";
import { useTranslation } from "react-i18next";
import { useCopyToClipboard } from "react-use";
import { SendouButton } from "./elements/Button";
import { CheckmarkIcon } from "./icons/Checkmark";
import { ClipboardIcon } from "./icons/Clipboard";

export default function Time({
	time,
	options = {
		minute: "numeric",
		hour: "numeric",
		day: "numeric",
		month: "long",
	},
}: {
	time: Date;
	options?: Intl.DateTimeFormatOptions;
}) {
	const { i18n } = useTranslation();

	const [open, setOpen] = useState(false);

	const triggerRef = useRef(null);

	const { t } = useTranslation(["common"]);

	const [state, copyToClipboard] = useCopyToClipboard();
	const [copySuccess, setCopySuccess] = React.useState(false);

	React.useEffect(() => {
		if (!state.value) return;

		setCopySuccess(true);
		const timeout = setTimeout(() => setCopySuccess(false), 2000);

		return () => clearTimeout(timeout);
	}, [state]);

	return (
		<div>
			<div
				ref={triggerRef}
				className="dotted clickable"
				onClick={() => {
					setOpen(true);
				}}
			>
				{time.toLocaleString(i18n.language, options)}
			</div>
			<Popover
				isOpen={open}
				className={"sendou-popover-content"}
				onOpenChange={setOpen}
				triggerRef={triggerRef}
			>
				<Dialog>
					<div className="stack sm">
						<div className="text-center">
							{time.toLocaleTimeString(i18n.language, {
								timeZoneName: "long",
								hour: "numeric",
								minute: "numeric",
							})}
						</div>
						<SendouButton
							size="miniscule"
							variant="minimal"
							onPress={() => copyToClipboard(`<t:${time.valueOf() / 1000}:F>`)}
							icon={copySuccess ? <CheckmarkIcon /> : <ClipboardIcon />}
						>
							{t("common:actions.copyTimestampForDiscord")}
						</SendouButton>
					</div>
				</Dialog>
			</Popover>
		</div>
	);
}
