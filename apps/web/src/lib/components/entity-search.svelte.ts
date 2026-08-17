const DEBOUNCE_MS = 500;

/**
 * Debounced search text for the entity search selects (`UserSearch`,
 * `TournamentSearch`). Bind `searchValue` to the Select's search input; read
 * `query` for the debounced, trimmed text to feed the remote query.
 *
 * Construct during component init (registers an `$effect` for the debounce).
 */
export class EntitySearchText {
	searchValue = $state("");
	query = $state("");

	constructor() {
		$effect(() => {
			const trimmed = this.searchValue.trim();
			if (!trimmed) {
				this.query = "";
				return;
			}

			const timeout = setTimeout(() => {
				this.query = trimmed;
			}, DEBOUNCE_MS);
			return () => clearTimeout(timeout);
		});
	}
}
