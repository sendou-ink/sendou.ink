import { Check, Clipboard } from "lucide-react";
import type * as React from "react";
import { useTranslation } from "react-i18next";
import { SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";

interface CopyToClipboardPopoverProps {
	url: string;
	trigger: React.ReactNode;
}

export function CopyToClipboardPopover({
	trigger,
	url,
}: CopyToClipboardPopoverProps) {
	const { t } = useTranslation(["common"]);
	const { copyToClipboard, copySuccess } = useCopyToClipboard();

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
