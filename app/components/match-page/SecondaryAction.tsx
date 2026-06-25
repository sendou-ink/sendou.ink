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
	/**
	 * Always-open variant used when this is the only content in the tab (no
	 * primary action to sit underneath). Hides the collapse toggle and drops the
	 * striped footer styling.
	 */
	standalone?: boolean;
	children: React.ReactNode;
}

/**
 * Generic panel hosting follow-up match actions (e.g. weapon reporting, scrim
 * map list management). Defaults to a striped footer attached beneath the
 * primary action card; pass `standalone` when it is the only tab content.
 */
export function SecondaryAction({
	isOpen,
	onOpenChange,
	collapsedLabel,
	collapsedIcon,
	expandedAriaLabel,
	standalone,
	children,
}: SecondaryActionProps) {
	const footerClass = standalone ? undefined : styles.footer;

	if (!isOpen && !standalone) {
		return (
			<div className={clsx(styles.collapsed, footerClass)}>
				<SendouButton
					variant="minimal"
					size="small"
					icon={collapsedIcon}
					onPress={() => onOpenChange(true)}
				>
					{collapsedLabel}
				</SendouButton>
			</div>
		);
	}

	return (
		<div className={clsx(styles.expanded, footerClass)}>
			{standalone ? null : (
				<SendouButton
					variant="minimal"
					size="miniscule"
					icon={<ChevronUp size={22} />}
					onPress={() => onOpenChange(false)}
					className={styles.collapseButton}
					aria-label={expandedAriaLabel ?? collapsedLabel}
				/>
			)}
			{children}
		</div>
	);
}
