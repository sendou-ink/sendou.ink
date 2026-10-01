import clsx from "clsx";
import { Check, CircleAlert, OctagonAlert, X } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { IS_E2E_TEST_RUN } from "~/utils/e2e";
import { Flipper } from "../Flipper";
import { SendouButton } from "./Button";
import styles from "./Toast.module.css";

export interface SendouToast {
	message: string;
	variant: "error" | "success" | "info";
}

interface QueuedToast {
	key: string;
	content: SendouToast;
}

class ToastQueue {
	private toasts: QueuedToast[] = [];
	private readonly listeners = new Set<() => void>();
	private counter = 0;

	add(content: SendouToast, options?: { timeout?: number }) {
		const key = `toast-${++this.counter}`;
		this.update(() => {
			this.toasts = [{ key, content }, ...this.toasts];
		});
		if (options?.timeout) {
			setTimeout(() => this.close(key), options.timeout);
		}
		return key;
	}

	close(key: string) {
		if (!this.toasts.some((toast) => toast.key === key)) return;
		this.update(() => {
			this.toasts = this.toasts.filter((toast) => toast.key !== key);
		});
	}

	subscribe = (listener: () => void) => {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	};

	getSnapshot = () => this.toasts;

	private update(mutate: () => void) {
		mutate();
		for (const listener of this.listeners) listener();
	}
}

export const toastQueue = new ToastQueue();

const EMPTY_TOASTS: QueuedToast[] = [];
const FADE_DURATION_MS = 400;

export function SendouToastRegion() {
	const { t } = useTranslation(["common"]);
	const toasts = React.useSyncExternalStore(
		toastQueue.subscribe,
		toastQueue.getSnapshot,
		() => EMPTY_TOASTS,
	);
	const regionRef = React.useRef<HTMLDivElement>(null);

	React.useEffect(() => {
		const region = regionRef.current;
		if (!region) return;
		if (toasts.length > 0 && !region.matches(":popover-open")) {
			region.showPopover();
		} else if (toasts.length === 0 && region.matches(":popover-open")) {
			hideAfterAnimations(region);
		}
	}, [toasts.length]);

	return (
		<section
			ref={regionRef}
			popover="manual"
			aria-label={t("common:notifications.title")}
			className={clsx(styles.toastRegion, { hidden: IS_E2E_TEST_RUN })}
		>
			<Flipper
				flipKey={toasts}
				fadeDuration={FADE_DURATION_MS}
				className={styles.toastList}
			>
				{toasts.map((toast) => (
					<div
						key={toast.key}
						data-flip-id={toast.key}
						role={toast.content.variant === "error" ? "alert" : "status"}
						className={clsx(styles.toast, {
							[styles.errorToast]: toast.content.variant === "error",
							[styles.successToast]: toast.content.variant === "success",
							[styles.infoToast]: toast.content.variant === "info",
						})}
					>
						<div className={styles.topRow}>
							{toast.content.variant === "success" ? (
								<Check className={styles.alertIcon} />
							) : toast.content.variant === "error" ? (
								<OctagonAlert className={styles.alertIcon} />
							) : (
								<CircleAlert className={styles.alertIcon} />
							)}
							{t(`common:toasts.${toast.content.variant}`)}
							<SendouButton
								variant="minimal"
								icon={<X />}
								className={styles.closeButton}
								aria-label="Close"
								onClick={() => toastQueue.close(toast.key)}
							/>
						</div>
						<div>{toast.content.message}</div>
					</div>
				))}
			</Flipper>
		</section>
	);
}

function hideAfterAnimations(region: HTMLElement) {
	const animations = region
		.getAnimations({ subtree: true })
		.map((animation) => animation.finished);

	void Promise.allSettled(animations).then(() => {
		if (toastQueue.getSnapshot().length > 0) return;
		if (region.matches(":popover-open")) region.hidePopover();
	});
}
