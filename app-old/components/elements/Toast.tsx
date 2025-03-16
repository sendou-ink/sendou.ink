import clsx from "clsx";
import {
	Text,
	UNSTABLE_Toast as Toast,
	UNSTABLE_ToastContent as ToastContent,
	UNSTABLE_ToastQueue as ToastQueue,
	UNSTABLE_ToastRegion as ToastRegion,
} from "react-aria-components";
import { flushSync } from "react-dom";
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

export const toastQueue = new ToastQueue<SendouToast>({
	wrapUpdate(fn) {
		if ("startViewTransition" in document) {
			document.startViewTransition(() => {
				flushSync(fn);
			});
		} else {
			fn();
		}
	},
});

export function SendouToastRegion() {
	const { t } = useTranslation(["common"]);

	return (
		<ToastRegion queue={toastQueue} className={styles.toastRegion}>
			{({ toast }) => (
				<Toast
					style={{ viewTransitionName: toast.key }}
					toast={toast}
					className={clsx(styles.toast, {
						[styles.errorToast]: toast.content.variant === "error",
						[styles.successToast]: toast.content.variant === "success",
						[styles.infoToast]: toast.content.variant === "info",
					})}
				>
					<ToastContent>
						<div className={styles.topRow}>
							{toast.content.variant === "success" ? (
								<CheckmarkIcon className={styles.alertIcon} />
							) : (
								<AlertIcon className={styles.alertIcon} />
							)}
							{t(`common:toasts.${toast.content.variant}`)}
							<SendouButton
								variant="minimal-destructive"
								icon={<CrossIcon />}
								className={styles.closeButton}
								slot="close"
							/>
						</div>
						<Text slot="title">{toast.content.message}</Text>
					</ToastContent>
				</Toast>
			)}
		</ToastRegion>
	);
}
