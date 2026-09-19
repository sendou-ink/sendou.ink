/** Browser-side file saving for exports (CSV, clips, fixtures). */

export function downloadBlob(name: string, blob: Blob): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = name;
	a.click();
	URL.revokeObjectURL(url);
}

export function downloadCsv(name: string, csv: string): void {
	downloadBlob(name, new Blob([csv], { type: "text/csv" }));
}
