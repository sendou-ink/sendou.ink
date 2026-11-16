import type { METADATA_FIELD_TYPE } from "./discord-constants";

export interface MetadataField {
	key: string;
	name: string;
	description: string;
	type: (typeof METADATA_FIELD_TYPE)[keyof typeof METADATA_FIELD_TYPE];
}

export interface SendouInkDiscordMetadata {
	plustier?: number;
}
