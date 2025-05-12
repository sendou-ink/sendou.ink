import type { ModalOverlayProps } from "react-aria-components";
import {
	Dialog,
	DialogTrigger,
	Heading,
	ModalOverlay,
} from "react-aria-components";
import { Modal } from "react-aria-components";

import { useNavigate } from "@remix-run/react";
import clsx from "clsx";
import { SendouButton } from "~/components/elements/Button";
import { CrossIcon } from "~/components/icons/Cross";
import styles from "./Dialog.module.css";

interface SendouDialogProps extends ModalOverlayProps {
	trigger?: React.ReactNode;
	children?: React.ReactNode;
	heading?: string;
	showHeading?: boolean;
	onClose?: () => void;
	/** When closing the modal which URL to navigate to */
	onCloseTo?: string;
	overlayClassName?: string;
	"aria-label"?: string;
	/** If true, the modal takes over the full screen with the content below hidden */
	isFullScreen?: boolean;
}

/**
 * This component allows you to create a dialog with a customizable trigger and content.
 * It supports both controlled and uncontrolled modes for managing the dialog's open state.
 *
 * @example
 * // Example usage with implicit isOpen
 * return (
 *   <SendouDialog
 *     heading="Dialog Title"
 *     onCloseTo={previousPageUrl()}
 *   >
 *     This is the dialog content.
 *   </SendouDialog>
 * );
 *
 * @example
 * // Example usage with a SendouButton as the trigger
 * return (
 *   <SendouDialog
 *     heading="Dialog Title"
 *     trigger={<SendouButton>Open Dialog</SendouButton>}
 *   >
 *     This is the dialog content.
 *   </SendouDialog>
 * );
 */
export function SendouDialog({
	trigger,
	children,
	...rest
}: SendouDialogProps) {
	if (!trigger) {
		const props =
			typeof rest.isOpen === "boolean" ? rest : { isOpen: true, ...rest };
		return <DialogModal {...props}>{children}</DialogModal>;
	}

	return (
		<DialogTrigger>
			{trigger}
			<DialogModal {...rest}>{children}</DialogModal>
		</DialogTrigger>
	);
}

function DialogModal({
	children,
	heading,
	showHeading = true,
	className,
	...rest
}: Omit<SendouDialogProps, "trigger">) {
	const navigate = useNavigate();

	const showCloseButton = rest.onClose || rest.onCloseTo;
	const onClose = () => {
		if (rest.onCloseTo) {
			navigate(rest.onCloseTo);
		} else if (rest.onClose) {
			rest.onClose();
		}
	};

	const onOpenChange = (isOpen: boolean) => {
		if (!isOpen) {
			if (rest.onCloseTo) {
				navigate(rest.onCloseTo);
			} else if (rest.onClose) {
				rest.onClose();
			}
		}
	};

	return (
		<ModalOverlay
			className={clsx(rest.overlayClassName, styles.overlay, {
				[styles.fullScreenOverlay]: rest.isFullScreen,
			})}
			onOpenChange={rest.onOpenChange ?? onOpenChange}
			{...rest}
		>
			<Modal
				className={clsx(className, styles.modal, {
					[styles.fullScreenModal]: rest.isFullScreen,
				})}
			>
				<Dialog className={styles.dialog} aria-label={rest["aria-label"]}>
					{showHeading ? (
						<div
							className={clsx(styles.headingContainer, {
								[styles.noHeading]: !heading,
							})}
						>
							{heading ? (
								<Heading slot="title" className={styles.heading}>
									{heading}
								</Heading>
							) : null}
							{showCloseButton ? (
								<SendouButton
									icon={<CrossIcon />}
									variant="minimal-destructive"
									className="ml-auto"
									slot="close"
									onPress={onClose}
								/>
							) : null}
						</div>
					) : null}
					{children}
				</Dialog>
			</Modal>
		</ModalOverlay>
	);
}
