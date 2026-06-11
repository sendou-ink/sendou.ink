const DELIMITER = ",";
const ROW_SEPARATOR = "\r\n";
const QUOTE = '"';
const CHARACTERS_REQUIRING_QUOTING = [DELIMITER, QUOTE, "\n", "\r"];

const FORMULA_PREFIX = "'";
const FORMULA_TRIGGERS = ["=", "+", "@", "\t", "\r"];

/**
 * Byte order mark to prepend when writing the CSV to a file, so that Excel
 * reads the bytes as UTF-8 and renders non-ASCII characters (e.g. Japanese or
 * accented names) correctly.
 */
export const BOM = "\uFEFF";

/**
 * Serializes a two-dimensional array of cell values into an RFC 4180 compliant
 * CSV string. Cells are quoted only when they contain a delimiter, quote or
 * line break, and any quotes inside a cell are escaped by doubling them.
 *
 * Cells whose value could be interpreted as a formula by spreadsheet software
 * (a "CSV injection") are prefixed with a single quote, which neutralizes the
 * formula while keeping the value readable. This matters because the input may
 * be user-controlled (team names, usernames, ...).
 *
 * @example
 * ```typescript
 * serialize([
 * 	["name", "note"],
 * 	["Sendou", 'say "hi"'],
 * 	["Test", "a,b"],
 * ]);
 * // name,note\r\nSendou,"say ""hi"""\r\nTest,"a,b"
 * ```
 */
export function serialize(rows: ReadonlyArray<ReadonlyArray<string>>): string {
	return rows.map(serializeRow).join(ROW_SEPARATOR);
}

function serializeRow(row: ReadonlyArray<string>): string {
	return row.map(serializeCell).join(DELIMITER);
}

function serializeCell(value: string): string {
	const safeValue = isFormulaInjectionRisk(value)
		? `${FORMULA_PREFIX}${value}`
		: value;

	const needsQuoting = CHARACTERS_REQUIRING_QUOTING.some((character) =>
		safeValue.includes(character),
	);
	if (!needsQuoting) return safeValue;

	return `${QUOTE}${safeValue.replaceAll(QUOTE, `${QUOTE}${QUOTE}`)}${QUOTE}`;
}

function isFormulaInjectionRisk(value: string): boolean {
	const firstCharacter = value[0];
	if (!firstCharacter) return false;
	if (FORMULA_TRIGGERS.includes(firstCharacter)) return true;
	// "-" can legitimately begin a negative number, so only guard it when the
	// value isn't numeric and could therefore be read as a formula
	if (firstCharacter === "-") return !isNumeric(value);
	return false;
}

function isNumeric(value: string): boolean {
	return value.trim() !== "" && Number.isFinite(Number(value));
}
