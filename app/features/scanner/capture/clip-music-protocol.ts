export interface ClipMusicRequest {
	clip: Blob;
	/** static assets CDN root (`Config.staticAssetsUrl`), passed in so the worker bundle stays free of the app config graph */
	assetsBaseUrl: string;
}

export type ClipMusicResponse =
	| { kind: "removed"; blob: Blob; titles: string[] }
	| { kind: "no-music" }
	| { kind: "error"; message: string };
