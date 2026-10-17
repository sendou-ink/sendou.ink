import { describe, expect, test } from "bun:test";
import { authorizationHeader } from "./s3.server";

describe("authorizationHeader", () => {
	// "Example: GET Object" from the AWS Signature Version 4 documentation
	test("matches the AWS documentation example", async () => {
		expect(
			await authorizationHeader({
				method: "GET",
				url: new URL("https://examplebucket.s3.amazonaws.com/test.txt"),
				headers: {
					host: "examplebucket.s3.amazonaws.com",
					range: "bytes=0-9",
					"x-amz-content-sha256":
						"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
					"x-amz-date": "20130524T000000Z",
				},
				accessKey: "AKIAIOSFODNN7EXAMPLE",
				secret: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
				region: "us-east-1",
			}),
		).toBe(
			"AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41",
		);
	});
});
