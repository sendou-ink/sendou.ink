/** snapdom options every graphic capture shares, untyped so `compress` (read at runtime but gone from snapdom's types) passes */
export const SNAPDOM_CAPTURE_OPTIONS = {
	format: "png",
	// snapdom's own download helper forces this, without it the export size would vary by device
	dpr: 1,
	embedFonts: true,
	// without this snapdom re-encodes images down to their rendered size, making e.g. the tier image look rough
	compress: false,
	// names ending in a glyph outside the graphic's font (emoji, Greek, ...) get measured with
	// one fallback font in the page and another when rasterized, so a box frozen to its exact
	// text width ends up an ellipsis short. This re-measures the clone and pins diverging boxes
	reconcile: true,
} as const;
