/** Truncates to at most `max` characters, preferring to cut at a sentence boundary. */
export function truncateBySentence(value: string, max: number) {
	if (value.length <= max) {
		return value;
	}

	// a sentence only ends at a terminator followed by whitespace, so that
	// e.g. "18.00" does not split in the middle
	const sentences = value.match(/[\s\S]+?(?:[.!?](?=\s|$)|\n|$)/g) || [];
	let result = "";

	for (const sentence of sentences) {
		if ((result + sentence).length > max) {
			break;
		}
		result += sentence;
	}

	// when cutting at a sentence boundary would leave most of the budget
	// unused, a mid-sentence cut that fills it is more informative
	if (result.length < max / 2) {
		return value.slice(0, max).trim();
	}

	return result.trim();
}
