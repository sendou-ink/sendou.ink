import clsx from "clsx";
import { X } from "lucide-react";
import type { ModalOverlayProps } from "react-aria-components";
import {
	Dialog,
	DialogTrigger,
	Heading,
	Modal,
	ModalOverlay,
} from "react-aria-components";
import { useNavigate } from "react-router";
import * as R from "remeda";
import { SendouButton } from "~/components/elements/Button";
import styles from "./Dialog.module.css";

interface SendouDialogProps extends ModalOverlayProps {
	trigger?: React.ReactNode;
	children?: React.ReactNode;
	heading?: string;
	showHeading?: boolean;
	onClose?: () => void;
	/** URL to navigate to on close */
	onCloseTo?: string;
	overlayClassName?: string;
	"aria-label"?: string;
	/** takes over the full screen, hiding the content below */
	isFullScreen?: boolean;
	/** show the close button even without onClose */
	showCloseButton?: boolean;
}

/**
 * Dialog that is open by default without a `trigger` (or controlled via `isOpen`), or opened by
 * the given `trigger` element.
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
			<DialogModal {...rest} isControlledByTrigger>
				{children}
			</DialogModal>
		</DialogTrigger>
	);
}

function DialogModal({
	children,
	heading,
	showHeading = true,
	className,
	showCloseButton: showCloseButtonProp,
	isControlledByTrigger,
	...rest
}: Omit<SendouDialogProps, "trigger"> & { isControlledByTrigger?: boolean }) {
	const navigate = useNavigate();

	const showCloseButton = showCloseButtonProp || rest.onClose || rest.onCloseTo;
	const onClose = () => {
		if (rest.onCloseTo) {
			navigate(rest.onCloseTo);
		} else if (rest.onClose) {
			rest.onClose();
		}
	};

	const defaultOnOpenChange = (isOpen: boolean) => {
		if (!isOpen) {
			if (rest.onCloseTo) {
				navigate(rest.onCloseTo);
			} else if (rest.onClose) {
				rest.onClose();
			}
		}
	};

	const overlayProps = isControlledByTrigger
		? R.omit(rest, ["onOpenChange"])
		: { ...rest, onOpenChange: rest.onOpenChange ?? defaultOnOpenChange };

	return (
		<ModalOverlay
			className={clsx(rest.overlayClassName, styles.overlay, {
				[styles.fullScreenOverlay]: rest.isFullScreen,
			})}
			{...overlayProps}
		>
			<Modal
				className={clsx(className, styles.modal, "scrollbar", {
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
									icon={<X />}
									shape="circle"
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
