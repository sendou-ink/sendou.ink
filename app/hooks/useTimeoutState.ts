import * as React from "react";

// TODO: fix causes memory leak
/** @link https://stackoverflow.com/a/64983274 */
export const useTimeoutState = <T>(
	defaultState: T,
): [
	T,
	(action: React.SetStateAction<T>, opts?: { timeout: number }) => void,
] => {
	const [state, _setState] = React.useState<T>(defaultState);
	const [currentTimeoutId, setCurrentTimeoutId] = React.useState<
		NodeJS.Timeout | undefined
	>();

	const setState = React.useCallback(
		(action: React.SetStateAction<T>, opts?: { timeout: number }) => {
			if (currentTimeoutId != null) {
				clearTimeout(currentTimeoutId);
			}

			_setState(action);

			const id = setTimeout(
				() => _setState(defaultState),
				opts?.timeout ?? 4000,
			);
			setCurrentTimeoutId(id);
		},
		[currentTimeoutId, defaultState],
	);
	return [state, setState];
};
