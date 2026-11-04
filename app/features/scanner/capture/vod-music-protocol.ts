export type VodMusicRequest =
	| {
			kind: "find";
			file: File;
			/** static assets CDN root (`Config.staticAssetsUrl`), passed in so the worker bundle stays free of the app config graph */
			assetsBaseUrl: string;
	  }
	| {
			kind: "write";
			/** a file the user picked; without one the video goes to `opfsName` in the origin private file system */
			handle: FileSystemFileHandle | null;
			opfsName: string;
	  };

export type VodMusicResponse =
	| { kind: "progress"; fraction: number }
	| { kind: "found"; seconds: number; titles: string[] }
	| { kind: "no-music" }
	| { kind: "written" }
	| { kind: "error"; message: string };
