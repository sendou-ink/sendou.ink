import { SendouFieldError } from "~/components/elements/FieldError";
import { SendouFieldMessage } from "~/components/elements/FieldMessage";

export function SendouBottomTexts({
	bottomText,
	errorText,
	errorId,
}: {
	bottomText?: string;
	errorText?: string;
	errorId?: string;
}) {
	return (
		<>
			{errorText ? (
				<SendouFieldError id={errorId}>{errorText}</SendouFieldError>
			) : (
				<SendouFieldError />
			)}
			{bottomText ? (
				<SendouFieldMessage>{bottomText}</SendouFieldMessage>
			) : null}
		</>
	);
}
