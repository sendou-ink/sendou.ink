/** Browser-side file saving for exports. */

import * as CSV from "~/modules/csv";

export function downloadBlob(name: string, blob: Blob): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = name;
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
}

export function downloadCsv(name: string, csv: string): void {
	downloadBlob(
		name,
		new Blob([CSV.BOM, csv], { type: "text/csv;charset=utf-8" }),
	);
}
