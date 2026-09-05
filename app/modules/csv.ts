const DELIMITER = ",";
const ROW_SEPARATOR = "\r\n";
const QUOTE = '"';
const CHARACTERS_REQUIRING_QUOTING = [DELIMITER, QUOTE, "\n", "\r"];

const FORMULA_PREFIX = "'";
const FORMULA_TRIGGERS = ["=", "+", "@", "\t", "\r"];

/** Prepend when writing to a file so Excel reads the bytes as UTF-8. */
export const BOM = "\uFEFF";

/**
 * RFC 4180 CSV: cells quoted only when needed, inner quotes doubled. Cells that spreadsheet software could
 * read as a formula (CSV injection from user-controlled input) are prefixed with a single quote.
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
	// "-" can legitimately begin a negative number
	if (firstCharacter === "-") return !isNumeric(value);
	return false;
}

function isNumeric(value: string): boolean {
	return value.trim() !== "" && Number.isFinite(Number(value));
}
