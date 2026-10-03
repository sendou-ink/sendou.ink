/** CSV assembly shared by the events and matches exports: RFC 4180 quoting, CRLF rows. */

/** text a spreadsheet would evaluate as a formula (OCR'd names, VoD file names) */
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

export type CsvCell = string | number | null | undefined;

export function toCsv(
	header: readonly string[],
	rows: readonly (readonly CsvCell[])[],
): string {
	const lines = [header.join(",")];
	for (const row of rows) lines.push(row.map(csvCell).join(","));
	return `${lines.join("\r\n")}\r\n`;
}

function csvCell(value: CsvCell): string {
	if (value === null || value === undefined) return "";
	const s =
		typeof value === "string" && FORMULA_TRIGGER.test(value)
			? `'${value}`
			: String(value);
	return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}
