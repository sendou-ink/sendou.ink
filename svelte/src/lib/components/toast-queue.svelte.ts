interface SendouToast {
	message: string;
	variant: "error" | "success" | "info";
}

interface QueuedToast {
	key: number;
	content: SendouToast;
}

class ToastQueue {
	toasts = $state.raw<QueuedToast[]>([]);
	#counter = 0;

	add(content: SendouToast, options?: { timeout?: number }) {
		const key = ++this.#counter;
		this.toasts = [{ key, content }, ...this.toasts];
		if (options?.timeout) {
			setTimeout(() => this.close(key), options.timeout);
		}
	}

	close(key: number) {
		this.toasts = this.toasts.filter((toast) => toast.key !== key);
	}
}

export const toastQueue = new ToastQueue();

const SUCCESS_TOAST_TIMEOUT_MS = 5000;

export function successToast(message: string) {
	toastQueue.add(
		{ message, variant: "success" },
		{ timeout: SUCCESS_TOAST_TIMEOUT_MS },
	);
}

export function errorToast(message: string) {
	toastQueue.add({ message, variant: "error" });
}
