export interface CensusRow {
	pattern: string;
	url: string | null;
	file: string;
	kind: "page" | "resource";
	skipped?: string;
}

export interface Census {
	seedNow: string | null;
	adminUserId: number;
	rows: CensusRow[];
}

export interface Viewport {
	name: string;
	width: number;
	height: number;
}

export interface RunConfig {
	repoRoot: string;
	webReactDir: string;
	/** The site domain baked into the shared e2e build; must be derived the
	 * same way as `E2E_BASE_PORT` so the e2e build gets reused. */
	bakedSiteDomain: string;
	outDir: string;
	seedNow: number;
	leftPort: number;
	rightPort: number;
	themes: string[];
	viewports: Viewport[];
	concurrency: number;
	filter: string | null;
	maxRows: number | null;
	skipPrepare: boolean;
}

export interface PixelResult {
	theme: string;
	viewport: string;
	status: "pass" | "fail" | "skipped";
	diffPixels?: number;
	note?: string;
	artifacts?: string[];
}

export interface HtmlResult {
	status: "pass" | "fail" | "skipped";
	note?: string;
	artifacts?: string[];
}

export interface AriaResult {
	viewport: string;
	status: "same" | "changed" | "skipped";
	note?: string;
	artifacts?: string[];
}

export interface ResourceResult {
	status: "pass" | "fail";
	leftStatus: number;
	rightStatus: number;
	note?: string;
	artifacts?: string[];
}

export interface RowResult {
	pattern: string;
	url: string;
	kind: "page" | "resource";
	pixel: PixelResult[];
	html: HtmlResult | null;
	aria: AriaResult[];
	resource: ResourceResult | null;
	notes: string[];
}

export interface Report {
	startedAt: string;
	durationMs: number;
	seedNow: string;
	left: string;
	right: string;
	rows: RowResult[];
	skippedRows: CensusRow[];
	summary: {
		pixelFailures: number;
		htmlFailures: number;
		resourceFailures: number;
		ariaChanges: number;
		errorPages: number;
	};
}
