import { useToast, useToastRegion } from "@react-aria/toast";
import type { AriaToastProps, AriaToastRegionProps } from "@react-aria/toast";
import { type ToastState, useToastState } from "@react-stately/toast";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { AlertIcon } from "../icons/Alert";
import { CheckmarkIcon } from "../icons/Checkmark";
import { CrossIcon } from "../icons/Cross";
import { SendouButton } from "./Button";
import styles from "./Toast.module.css";

export interface SendouToast {
	message: string;
	variant: "error" | "success" | "info";
}

export function ToastProvider({
	children,
}: { children: (state: ToastState<SendouToast>) => React.ReactElement }) {
	const state = useToastState<SendouToast>({
		maxVisibleToasts: 5,
	});

	return (
		<>
			{children(state)}
			{state.visibleToasts.length > 0 && <ToastRegion state={state} />}
		</>
	);
}

interface ToastRegionProps extends AriaToastRegionProps {
	state: ToastState<SendouToast>;
}

function ToastRegion({ state, ...props }: ToastRegionProps) {
	const ref = React.useRef(null);
	const { regionProps } = useToastRegion(props, state, ref);

	return (
		<div {...regionProps} ref={ref} className={styles.toastRegion}>
			{state.visibleToasts.map((toast) => (
				<Toast key={toast.key} toast={toast} state={state} />
			))}
		</div>
	);
}

interface ToastProps extends AriaToastProps<SendouToast> {
	state: ToastState<SendouToast>;
}

function Toast({ state, ...props }: ToastProps) {
	const ref = React.useRef(null);
	const { t } = useTranslation(["common"]);
	const { toastProps, contentProps, titleProps, closeButtonProps } = useToast(
		props,
		state,
		ref,
	);

	return (
		<div
			{...toastProps}
			ref={ref}
			className={styles.toast}
			data-toast-variant={props.toast.content.variant}
		>
			<div className={styles.topRow}>
				{props.toast.content.variant === "success" ? (
					<CheckmarkIcon className={styles.alertIcon} />
				) : (
					<AlertIcon className={styles.alertIcon} />
				)}
				{t(`common:toasts.${props.toast.content.variant}`)}
				<SendouButton
					variant="minimal-destructive"
					icon={<CrossIcon />}
					className={styles.closeButton}
					{...closeButtonProps}
				/>
			</div>
			<div {...contentProps}>
				<div {...titleProps}>{props.toast.content.message}</div>
			</div>
		</div>
	);
}
