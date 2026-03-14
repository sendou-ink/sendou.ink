declare namespace Intl {
	interface DurationFormatOptions {
		style?: "long" | "short" | "narrow" | "digital";
	}

	interface DurationInput {
		years?: number;
		months?: number;
		weeks?: number;
		days?: number;
		hours?: number;
		minutes?: number;
		seconds?: number;
		milliseconds?: number;
		microseconds?: number;
		nanoseconds?: number;
	}

	class DurationFormat {
		constructor(locales?: string | string[], options?: DurationFormatOptions);
		format(duration: DurationInput): string;
	}
}
