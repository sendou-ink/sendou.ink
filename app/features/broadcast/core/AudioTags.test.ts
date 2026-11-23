import { describe, expect, test } from "vitest";
import * as AudioTags from "./AudioTags";

const COVER = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

describe("AudioTags.read", () => {
	test.each([
		{ why: "ID3v2.3 latin-1", version: 3, encoding: 0 },
		{ why: "ID3v2.3 UTF-16 with BOM", version: 3, encoding: 1 },
		{ why: "ID3v2.4 UTF-8", version: 4, encoding: 3 },
		{ why: "ID3v2.4 UTF-16BE", version: 4, encoding: 2 },
	])("reads the title and artist of $why", ({ version, encoding }) => {
		const file = id3(version, [
			id3Frame(version, "TIT2", id3TextBody("Ocean Eyes", encoding)),
			id3Frame(version, "TPE1", id3TextBody("Ink Collective", encoding)),
		]);

		expect(AudioTags.read(file)).toEqual({
			title: "Ocean Eyes",
			artist: "Ink Collective",
		});
	});

	test("reads UTF-16 with a big-endian BOM", () => {
		const bigEndian = concat(
			[1, 0xfe, 0xff],
			Array.from("Hi").flatMap((char) => [0, char.charCodeAt(0)]),
		);
		const file = id3(3, [id3Frame(3, "TIT2", bigEndian)]);

		expect(AudioTags.read(file).title).toBe("Hi");
	});

	test("joins the artists of an ID3v2.4 frame with several", () => {
		const file = id3(4, [id3Frame(4, "TPE1", id3TextBody("One\0Two", 3))]);

		expect(AudioTags.read(file).artist).toBe("One, Two");
	});

	test("reads the frames after a cover picture", () => {
		const file = id3(3, [
			id3Frame(3, "APIC", apicBody({ type: 3, bytes: COVER, encoding: 1 })),
			id3Frame(3, "TIT2", id3TextBody("After Art", 0)),
		]);

		expect(AudioTags.read(file).title).toBe("After Art");
	});

	test("reads an ID3v2.2 tag", () => {
		const file = concat(
			ascii("ID3"),
			[2, 0, 0],
			syncsafe(32),
			ascii("TT2"),
			[0, 0, 4],
			[0],
			ascii("Old"),
			new Array(19).fill(0),
		);

		expect(AudioTags.read(file).title).toBe("Old");
	});

	test("reads FLAC's Vorbis comments after its picture block", () => {
		const file = concat(
			ascii("fLaC"),
			flacBlock(6, flacPicture(COVER, "image/jpeg")),
			flacBlock(4, vorbisComments(["TITLE=Splash", "artist=Squid Band"]), true),
		);

		expect(AudioTags.read(file)).toEqual({
			title: "Splash",
			artist: "Squid Band",
		});
	});

	test("reads Opus comments spanning Ogg pages, a picture among them", () => {
		const picture = btoa(
			String.fromCharCode(...flacPicture(COVER, "image/png")),
		);
		const comments = concat(
			ascii("OpusTags"),
			vorbisComments([
				"TITLE=Long Tide",
				"ARTIST=Reef",
				`METADATA_BLOCK_PICTURE=${picture}`,
				`COMMENT=${"x".repeat(600)}`,
			]),
		);
		const file = concat(
			oggPage([concat(ascii("OpusHead"), new Array(11).fill(0))]),
			...oggPages(comments, 2),
		);

		expect(AudioTags.read(file)).toEqual({
			title: "Long Tide",
			artist: "Reef",
		});
	});

	test("reads an MP4 file's metadata items", () => {
		const file = concat(
			atom("ftyp", ascii("M4A ")),
			atom(
				"moov",
				atom(
					"udta",
					atom(
						"meta",
						concat(
							[0, 0, 0, 0],
							atom(
								"ilst",
								concat(
									atom("©nam", mp4Data(1, utf8("Deep Cut"))),
									atom("©ART", mp4Data(1, utf8("Off the Hook"))),
									atom("covr", mp4Data(14, COVER)),
								),
							),
						),
					),
				),
			),
		);

		expect(AudioTags.read(file)).toEqual({
			title: "Deep Cut",
			artist: "Off the Hook",
		});
	});

	test("keeps what was read before a broken tag", () => {
		const file = id3(3, [
			id3Frame(3, "TIT2", id3TextBody("Kept", 0)),
			concat(ascii("APIC"), [0, 0, 0, 200], [0, 0], [0]),
		]);

		expect(AudioTags.read(file).title).toBe("Kept");
	});

	test("reads nothing of a file without tags", () => {
		expect(AudioTags.read(Uint8Array.from([0xff, 0xfb, 0x90, 0x00]))).toEqual({
			title: null,
			artist: null,
		});
	});
});

function id3(version: number, frames: Uint8Array[]) {
	const body = concat(...frames, new Array(16).fill(0));

	return concat(ascii("ID3"), [version, 0, 0], syncsafe(body.length), body);
}

function id3Frame(version: number, id: string, body: Uint8Array) {
	const size =
		version === 4 ? syncsafe(body.length) : uint32BigEndian(body.length);

	return concat(ascii(id), size, [0, 0], body);
}

function id3TextBody(text: string, encoding: number) {
	return concat([encoding], encode(text, encoding));
}

function apicBody({
	type,
	bytes,
	encoding,
}: {
	type: number;
	bytes: Uint8Array;
	encoding: number;
}) {
	const terminator = encoding === 1 || encoding === 2 ? [0, 0] : [0];

	return concat(
		[encoding],
		ascii("image/jpeg"),
		[0],
		[type],
		encode("desc", encoding),
		terminator,
		bytes,
	);
}

function encode(text: string, encoding: number) {
	switch (encoding) {
		case 1:
			return concat(
				[0xff, 0xfe],
				Array.from(text).flatMap((char) => [char.charCodeAt(0), 0]),
			);
		case 2:
			return Uint8Array.from(
				Array.from(text).flatMap((char) => [0, char.charCodeAt(0)]),
			);
		case 3:
			return utf8(text);
		default:
			return ascii(text);
	}
}

function flacBlock(type: number, body: Uint8Array, isLast = false) {
	return concat(
		[(isLast ? 0x80 : 0) | type],
		uint32BigEndian(body.length).slice(1),
		body,
	);
}

function flacPicture(bytes: Uint8Array, mimeType: string) {
	return concat(
		uint32BigEndian(3),
		uint32BigEndian(mimeType.length),
		ascii(mimeType),
		uint32BigEndian(0),
		new Array(16).fill(0),
		uint32BigEndian(bytes.length),
		bytes,
	);
}

function vorbisComments(comments: string[]) {
	const vendor = utf8("test");

	return concat(
		uint32LittleEndian(vendor.length),
		vendor,
		uint32LittleEndian(comments.length),
		...comments.map((comment) => {
			const bytes = utf8(comment);
			return concat(uint32LittleEndian(bytes.length), bytes);
		}),
	);
}

/** The packet laid out over pages of at most `segmentsPerPage` segments. */
function oggPages(packet: Uint8Array, segmentsPerPage: number) {
	const segments: Uint8Array[] = [];
	for (let offset = 0; offset <= packet.length; offset += 255) {
		segments.push(packet.subarray(offset, offset + 255));
	}
	const pages: Uint8Array[] = [];
	for (let i = 0; i < segments.length; i += segmentsPerPage) {
		pages.push(oggPageOfSegments(segments.slice(i, i + segmentsPerPage)));
	}

	return pages;
}

function oggPage(packets: Uint8Array[]) {
	return oggPageOfSegments(
		packets.flatMap((packet) => {
			const segments: Uint8Array[] = [];
			for (let offset = 0; offset <= packet.length; offset += 255) {
				segments.push(packet.subarray(offset, offset + 255));
			}
			return segments;
		}),
	);
}

function oggPageOfSegments(segments: Uint8Array[]) {
	return concat(
		ascii("OggS"),
		[0, 0],
		new Array(8).fill(0),
		uint32LittleEndian(1),
		new Array(8).fill(0),
		[segments.length],
		segments.map((segment) => segment.length),
		...segments,
	);
}

function atom(type: string, body: Uint8Array) {
	return concat(
		uint32BigEndian(body.length + 8),
		Array.from(type, (char) => char.charCodeAt(0)),
		body,
	);
}

function mp4Data(type: number, value: Uint8Array) {
	return atom("data", concat(uint32BigEndian(type), [0, 0, 0, 0], value));
}

function syncsafe(value: number) {
	return [
		(value >> 21) & 0x7f,
		(value >> 14) & 0x7f,
		(value >> 7) & 0x7f,
		value & 0x7f,
	];
}

function uint32BigEndian(value: number) {
	return Uint8Array.from([
		(value >>> 24) & 0xff,
		(value >>> 16) & 0xff,
		(value >>> 8) & 0xff,
		value & 0xff,
	]);
}

function uint32LittleEndian(value: number) {
	return uint32BigEndian(value).reverse();
}

function ascii(text: string) {
	return Uint8Array.from(text, (char) => char.charCodeAt(0));
}

function utf8(text: string) {
	return new TextEncoder().encode(text);
}

function concat(...parts: Array<Uint8Array | number[]>) {
	const result = new Uint8Array(
		parts.reduce((sum, part) => sum + part.length, 0),
	);
	let offset = 0;
	for (const part of parts) {
		result.set(part, offset);
		offset += part.length;
	}

	return result;
}
