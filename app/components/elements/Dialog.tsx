import clsx from "clsx";
import { X } from "lucide-react";
import * as React from "react";
import { useNavigate } from "react-router";
import { SendouButton } from "~/components/elements/Button";
import styles from "./Dialog.module.css";

/**
 * Unstyled native `<dialog>` shell: shows itself modally on mount, closes on
 * Escape (and outside clicks when `isDismissable`) and reports every close
 * through `onClose`. The caller owns visibility by mounting/unmounting it.
 */
export function SendouModal({
	className,
	isDismissable,
	onClose,
	"aria-label": ariaLabel,
	"aria-labelledby": ariaLabelledby,
	children,
	ref,
}: {
	className?: string;
	isDismissable?: boolean;
	onClose?: () => void;
	"aria-label"?: string;
	"aria-labelledby"?: string;
	children: React.ReactNode;
	ref?: React.Ref<HTMLDialogElement>;
}) {
	return (
		<dialog
			ref={(dialog) => {
				if (typeof ref === "function") {
					ref(dialog);
				} else if (ref) {
					ref.current = dialog;
				}
				if (dialog && !dialog.open) {
					dialog.showModal();
				}
			}}
			className={className}
			aria-label={ariaLabel}
			aria-labelledby={ariaLabelledby}
			closedby={isDismissable ? "any" : "closerequest"}
			onClose={onClose}
			onClick={
				isDismissable
					? (event) => {
							// Safari is missing `closedby`, close on backdrop clicks manually
							if (event.target !== event.currentTarget) return;
							const rect = event.currentTarget.getBoundingClientRect();
							const outside =
								event.clientX < rect.left ||
								event.clientX > rect.right ||
								event.clientY < rect.top ||
								event.clientY > rect.bottom;
							if (outside) {
								event.currentTarget.close();
							}
						}
					: undefined
			}
		>
			{children}
		</dialog>
	);
}

interface SendouDialogProps {
	trigger?: React.ReactElement<{ onPress?: () => void }>;
	children?: React.ReactNode;
	heading?: string;
	showHeading?: boolean;
	onClose?: () => void;
	/** When closing the modal which URL to navigate to */
	onCloseTo?: string;
	onOpenChange?: (isOpen: boolean) => void;
	isOpen?: boolean;
	/** Closing by clicking outside the dialog. */
	isDismissable?: boolean;
	className?: string;
	"aria-label"?: string;
	/** If true, the modal takes over the full screen with the content below hidden */
	isFullScreen?: boolean;
	/** If true, shows the close button even if onClose is not provided */
	showCloseButton?: boolean;
}

/**
 * This component allows you to create a modal dialog with a customizable
 * trigger and content, rendered through the native `<dialog>` element.
 * It supports both controlled and uncontrolled modes for managing the
 * dialog's open state.
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
	const [triggerOpen, setTriggerOpen] = React.useState(false);

	if (!trigger) {
		const props =
			typeof rest.isOpen === "boolean" ? rest : { ...rest, isOpen: true };
		return <DialogModal {...props}>{children}</DialogModal>;
	}

	return (
		<>
			{React.cloneElement(trigger, {
				onPress: () => {
					trigger.props.onPress?.();
					setTriggerOpen(true);
				},
			})}
			{triggerOpen ? (
				<DialogModal {...rest} isOpen onDismiss={() => setTriggerOpen(false)}>
					{children}
				</DialogModal>
			) : null}
		</>
	);
}

function DialogModal({
	children,
	heading,
	showHeading = true,
	className,
	showCloseButton: showCloseButtonProp,
	isOpen,
	isDismissable,
	isFullScreen,
	onOpenChange,
	onClose: onCloseProp,
	onCloseTo,
	onDismiss,
	"aria-label": ariaLabel,
}: Omit<SendouDialogProps, "trigger"> & {
	/** Trigger-managed mode: unrenders the dialog on close. */
	onDismiss?: () => void;
}) {
	const navigate = useNavigate();
	const dialogRef = React.useRef<HTMLDialogElement>(null);
	const headingId = React.useId();

	const showCloseButton = showCloseButtonProp || onCloseProp || onCloseTo;

	const handleClosed = () => {
		if (onDismiss) {
			onDismiss();
			if (onCloseTo) {
				navigate(onCloseTo);
			} else {
				onCloseProp?.();
			}
			return;
		}

		if (onOpenChange) {
			onOpenChange(false);
		} else if (onCloseTo) {
			navigate(onCloseTo);
		} else {
			onCloseProp?.();
		}
	};

	if (!isOpen) return null;

	return (
		<SendouModal
			ref={dialogRef}
			className={clsx(className, styles.modal, "scrollbar", {
				[styles.fullScreenModal]: isFullScreen,
			})}
			aria-label={ariaLabel}
			aria-labelledby={!ariaLabel && heading ? headingId : undefined}
			isDismissable={isDismissable}
			onClose={handleClosed}
		>
			{showHeading ? (
				<div
					className={clsx(styles.headingContainer, {
						[styles.noHeading]: !heading,
					})}
				>
					{heading ? (
						<h2 id={headingId} className={styles.heading}>
							{heading}
						</h2>
					) : null}
					{showCloseButton ? (
						<SendouButton
							icon={<X />}
							shape="circle"
							variant="minimal-destructive"
							className="ml-auto"
							aria-label="Close"
							onPress={() => dialogRef.current?.close()}
						/>
					) : null}
				</div>
			) : null}
			{children}
		</SendouModal>
	);
}
