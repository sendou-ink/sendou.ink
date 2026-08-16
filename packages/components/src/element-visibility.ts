import { createSubscriber } from "svelte/reactivity";

export interface ElementVisibilityTarget {
	element: Element;
	/** viewport offset from the top treated as out of view (e.g. a sticky header) */
	marginTop?: number;
	/** intersection ratio the observer reports crossings of */
	threshold?: number;
}

// xxx: which folder it belongs to?
/**
 * Reactive viewport visibility of an element, driven by an IntersectionObserver.
 *
 * Observation is lazy: the observer only runs while an effect reads `ratio`,
 * and `getTarget` returning `null` (e.g. while a popover is closed) keeps it off.
 */
export class ElementVisibility {
	#getTarget: () => ElementVisibilityTarget | null;
	#subscribe: () => void;
	#visibleRatio: number | null = null;

	constructor(getTarget: () => ElementVisibilityTarget | null) {
		this.#getTarget = getTarget;
		this.#subscribe = createSubscriber((update) => {
			const target = this.#getTarget();
			if (!target) return;

			const observer = new IntersectionObserver(
				(entries) => {
					const entry = entries.at(-1);
					if (!entry) return;
					this.#visibleRatio = entry.intersectionRatio;
					update();
				},
				{
					threshold: target.threshold ?? [0, 1],
					rootMargin: `${-(target.marginTop ?? 0)}px 0px 0px 0px`,
				},
			);
			observer.observe(target.element);

			return () => {
				observer.disconnect();
				this.#visibleRatio = null;
			};
		});
	}

	/** visible intersection ratio of the target, `null` until the first measurement */
	get ratio(): number | null {
		this.#subscribe();
		return this.#visibleRatio;
	}
}
