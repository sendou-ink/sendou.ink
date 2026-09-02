import clsx from "clsx";
import { ChevronUp } from "lucide-react";
import type * as React from "react";
import { SendouButton } from "../elements/Button";
import styles from "./SecondaryAction.module.css";

interface SecondaryActionProps {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	collapsedLabel: string;
	collapsedIcon?: React.JSX.Element;
	expandedAriaLabel?: string;
	/** Only content in the tab: always open, no collapse toggle, no striped footer styling. */
	standalone?: boolean;
	/** Always open without the collapse toggle, keeping the footer styling. */
	alwaysOpen?: boolean;
	children: React.ReactNode;
}

/** Panel for follow-up match actions (weapon reporting etc.), a striped footer beneath the primary action card. */
export function SecondaryAction({
	isOpen,
	onOpenChange,
	collapsedLabel,
	collapsedIcon,
	expandedAriaLabel,
	standalone,
	alwaysOpen,
	children,
}: SecondaryActionProps) {
	const footerClass = standalone ? undefined : styles.footer;
	const collapsible = !standalone && !alwaysOpen;

	if (!isOpen && collapsible) {
		return (
			<div className={clsx(styles.collapsed, footerClass)}>
				<SendouButton
					variant="minimal"
					size="small"
					icon={collapsedIcon}
					onPress={() => onOpenChange(true)}
					testId="expand-secondary-action-button"
				>
					{collapsedLabel}
				</SendouButton>
			</div>
		);
	}

	return (
		<div className={clsx(styles.expanded, footerClass)}>
			{collapsible ? (
				<SendouButton
					variant="minimal"
					size="miniscule"
					icon={<ChevronUp size={22} />}
					onPress={() => onOpenChange(false)}
					className={styles.collapseButton}
					aria-label={expandedAriaLabel ?? collapsedLabel}
					testId="collapse-secondary-action-button"
				/>
			) : null}
			{children}
		</div>
	);
}
