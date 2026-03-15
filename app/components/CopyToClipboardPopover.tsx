import { Check, Clipboard } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useCopyToClipboard } from "react-use";
import { SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";

interface CopyToClipboardPopoverProps {
	url: string;
	trigger: React.ReactNode;
}

export function CopyToClipboardPopover({
	trigger,
	url,
}: CopyToClipboardPopoverProps) {
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
		<SendouPopover trigger={trigger}>
			<div className="stack sm">
				<input defaultValue={url} readOnly />
				<SendouButton
					size="miniscule"
					variant="minimal"
					onPress={() => copyToClipboard(url)}
					icon={copySuccess ? <Check /> : <Clipboard />}
				>
					{t("common:actions.copyToClipboard")}
				</SendouButton>
			</div>
		</SendouPopover>
	);
}
