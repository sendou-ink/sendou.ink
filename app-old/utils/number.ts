export function roundToNDecimalPlaces(num: number, n = 2) {
	return Number((Math.round(num * 10 ** n) / 10 ** n).toFixed(n));
}

export function cutToNDecimalPlaces(num: number, n = 2) {
	const multiplier = 10 ** n;
	const truncatedNum = Math.trunc(num * multiplier) / multiplier;
	const result = truncatedNum.toFixed(n);
	return Number(n > 0 ? result.replace(/\.?0+$/, "") : result);
}

export function sumArray(arr: number[]) {
	return arr.reduce((acc, curr) => acc + curr, 0);
}

export function averageArray(arr: number[]) {
	return sumArray(arr) / arr.length;
}

export function safeNumberParse(value: string | null) {
	if (value === null) return null;

	const result = Number(value);
	return Number.isNaN(result) ? null : result;
}
