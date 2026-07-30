import { Share2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SendouButton } from "~/components/elements/Button";
import { CopyToClipboardPopover } from "./CopyToClipboardPopover";

export function ShareUrlButton({
	url,
	...buttonProps
}: { url: string } & React.ComponentProps<typeof SendouButton>) {
	const { t } = useTranslation(["common"]);

	const canNativeShare =
		typeof navigator !== "undefined" && typeof navigator.share === "function";

	if (canNativeShare) {
		return (
			<SendouButton
				variant="outlined"
				size="small"
				shape="circle"
				icon={<Share2 />}
				onPress={() => navigator.share({ url })}
				aria-label={t("common:actions.share")}
				{...buttonProps}
			/>
		);
	}

	return (
		<CopyToClipboardPopover
			url={url}
			trigger={
				<SendouButton
					variant="outlined"
					size="small"
					shape="circle"
					icon={<Share2 />}
					aria-label={t("common:actions.share")}
					{...buttonProps}
				/>
			}
		/>
	);
}
