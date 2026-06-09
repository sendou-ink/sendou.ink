import clsx from "clsx";
import { ChevronUp } from "lucide-react";
import * as React from "react";
import { SendouButton } from "../elements/Button";
import styles from "./SecondaryAction.module.css";
import { JSX } from "react";

interface SecondaryActionProps {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	collapsedLabel: string;
	collapsedIcon?: JSX.Element;
	expandedAriaLabel?: string;
	standalone?: boolean;
	children: React.ReactNode;
}

/**
 * Generic collapsible panel rendered below the primary match action.
 * Hosts optional follow-up actions (e.g. weapon reporting, scrim map list
 * management) and switches to a full-tab standalone variant when there is
 * no primary action to sit underneath.
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
	if (!isOpen && !standalone) {
		return (
			<div className={styles.rootCollapsed}>
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
		<div className={clsx(styles.root, { [styles.standalone]: standalone })}>
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
