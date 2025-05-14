import { SendouFieldError } from "~/components/elements/FieldError";
import { SendouFieldMessage } from "~/components/elements/FieldMessage";

export function SendouBottomTexts({
	bottomText,
	errorText,
}: {
	bottomText?: string;
	errorText?: string;
}) {
	return (
		<>
			{errorText ? (
				<SendouFieldError>{errorText}</SendouFieldError>
			) : (
				<SendouFieldError />
			)}
			{bottomText && !errorText ? (
				<SendouFieldMessage>{bottomText}</SendouFieldMessage>
			) : null}
		</>
	);
}
