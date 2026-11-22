import * as React from "react";
import { useTranslation } from "react-i18next";
import { FormMessage } from "~/components/FormMessage";
import * as ObsWebSocket from "~/features/broadcast/core/ObsWebSocket";
import { FormField } from "~/form/FormField";
import { useFormValue } from "~/form/SendouForm";
import { useDebounce } from "~/hooks/useDebounce";
import { broadcastObsInputNameSelectField } from "../broadcast-cast-schemas";

/** How long the port and password stay unchanged before the sources are read from OBS with them. */
const LOAD_SOURCES_DEBOUNCE_MS = 500;

/** Why the sources didn't load, for the message under the field. */
type LoadProblem =
	| "no-sources"
	| Exclude<ObsWebSocket.ListCaptureCardSourcesResult["type"], "sources">;

/**
 * The capture card source field of the OBS audio form: a dropdown of the sources in the OBS on this computer, read with
 * the port and password filled in above it whenever they change, or a text field while OBS can't be read.
 */
export function ObsCaptureCardField() {
	const { t } = useTranslation(["broadcast"]);
	const port = useFormValue("port");
	const password = useFormValue("password");
	const inputName = useFormValue("inputName");
	const [sourceNames, setSourceNames] = React.useState<string[] | null>(null);
	const [problem, setProblem] = React.useState<LoadProblem | null>(null);
	const latestLoadRef = React.useRef(0);

	useDebounce(
		async () => {
			const load = ++latestLoadRef.current;
			const result = await ObsWebSocket.listCaptureCardSources({
				port: Number(port),
				password: typeof password === "string" && password ? password : null,
			});
			if (load !== latestLoadRef.current) return;

			const names = result.type === "sources" ? result.names : [];
			setSourceNames(names.length > 0 ? names : null);
			setProblem(
				result.type !== "sources"
					? result.type
					: names.length > 0
						? null
						: "no-sources",
			);
		},
		LOAD_SOURCES_DEBOUNCE_MS,
		[port, password],
	);

	const savedName =
		typeof inputName === "string" && inputName ? inputName : null;
	const options = sourceNames
		? [
				...sourceNames,
				...(savedName && !sourceNames.includes(savedName) ? [savedName] : []),
			].map((name) => ({ value: name, label: name }))
		: null;

	return (
		<div className="stack sm">
			{options ? (
				<FormField
					name="inputName"
					field={broadcastObsInputNameSelectField}
					options={options}
				/>
			) : (
				<FormField name="inputName" />
			)}
			{problem === "unreachable" ? (
				<FormMessage type="info" spaced={false}>
					{t("broadcast:dashboard.setup.obsSources.unreachable")}
				</FormMessage>
			) : problem === "wrong-password" ? (
				<FormMessage type="error" spaced={false}>
					{t("broadcast:dashboard.setup.obsSources.wrongPassword")}
				</FormMessage>
			) : problem === "no-sources" ? (
				<FormMessage type="info" spaced={false}>
					{t("broadcast:dashboard.setup.obsSources.none")}
				</FormMessage>
			) : null}
		</div>
	);
}
