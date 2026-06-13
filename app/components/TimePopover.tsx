import clsx from "clsx";
import { Check, Clipboard } from "lucide-react";
import { useRef, useState } from "react";
import { Dialog, Popover } from "react-aria-components";
import { useTranslation } from "react-i18next";
import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";
import { SendouButton } from "./elements/Button";
import popoverStyles from "./elements/Popover.module.css";
import { LocaleTime } from "./LocaleTime";
import styles from "./TimePopover.module.css";

export default function TimePopover({
	date,
	options = {
		minute: "numeric",
		hour: "numeric",
		day: "numeric",
		month: "numeric",
	},
	underline = true,
	className,
	footerText,
}: {
	date: Date;
	options?: Intl.DateTimeFormatOptions;
	underline?: boolean;
	className?: string;
	footerText?: string;
}) {
	const [open, setOpen] = useState(false);

	const triggerRef = useRef(null);

	const { t } = useTranslation(["common"]);

	const { copyToClipboard, copySuccess } = useCopyToClipboard();

	return (
		<div>
			<button
				type="button"
				ref={triggerRef}
				className={clsx(
					className,
					"clickable",
					styles.textOnlyButton,
					underline ? styles.dotted : "",
				)}
				onClick={() => {
					setOpen(true);
				}}
			>
				<LocaleTime date={date} options={options} inline />
			</button>
			<Popover
				isOpen={open}
				className={popoverStyles.content}
				onOpenChange={setOpen}
				triggerRef={triggerRef}
			>
				<Dialog className={popoverStyles.dialog}>
					<div className="stack sm">
						<div className="text-center">
							<LocaleTime
								date={date}
								options={{
									timeZoneName: "long",
									hour: "numeric",
									minute: "numeric",
								}}
							/>
						</div>
						<SendouButton
							size="miniscule"
							variant="minimal"
							onPress={() => copyToClipboard(`<t:${date.valueOf() / 1000}:F>`)}
							icon={copySuccess ? <Check /> : <Clipboard />}
						>
							{t("common:actions.copyTimestampForDiscord")}
						</SendouButton>
						{footerText ? (
							<div className="text-lighter text-center mt-2 text-xs">
								{footerText}
							</div>
						) : null}
					</div>
				</Dialog>
			</Popover>
		</div>
	);
}
