export function valueArrayToDBFormat<T>(arr: Array<{ value?: T }>) {
	const unwrapped = arr
		.map((item) => {
			if (typeof item.value === "string" && item.value === "") {
				return null;
			}

			return item.value;
		})
		.filter((item) => item !== null && item !== undefined);

	return unwrapped.length === 0 ? null : unwrapped;
}

export function wrapToValueStringArrayWithDefault(arr?: Array<string> | null) {
	return (
		arr?.map((value) => ({
			value,
		})) ?? [{ value: "" }]
	);
}
