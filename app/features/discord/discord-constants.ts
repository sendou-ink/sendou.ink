export const LINKED_ROLE_CALLBACK_URL = "/discord/oauth-callback";

/** https://discord.com/developers/docs/resources/application-role-connection-metadata#application-role-connection-metadata-object-application-role-connection-metadata-type */
export const METADATA_FIELD_TYPE = {
	INTEGER_LESS_THAN_OR_EQUAL: 1,
	INTEGER_GREATER_THAN_OR_EQUAL: 2,
	INTEGER_EQUAL: 3,
	INTEGER_NOT_EQUAL: 4,
	DATETIME_LESS_THAN_OR_EQUAL: 5,
	DATETIME_GREATER_THAN_OR_EQUAL: 6,
	BOOLEAN_EQUAL: 7,
	BOOLEAN_NOT_EQUAL: 8,
} as const;
