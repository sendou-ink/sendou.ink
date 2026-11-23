/**
 * Reads what a music file's own tags say of it, so a track dropped into the broadcast dashboard's music library comes
 * with its title and artist: ID3v2 (MP3), FLAC, Ogg Vorbis and Opus comments, MP4 (M4A) metadata.
 */

const MP4_TEXT_TYPE = 1;

/** What a music file's tags say of it, `null` for what they leave out. */
export interface AudioTags {
	title: string | null;
	artist: string | null;
}

/**
 * Title and artist of an audio file from its tags. Both `null` for another kind of file or one without tags, and for a
 * broken tag what was read before it broke.
 */
export function read(bytes: Uint8Array): AudioTags {
	const tags: AudioTags = { title: null, artist: null };

	try {
		if (startsWith(bytes, 0, "ID3")) readId3(bytes, tags);
		else if (startsWith(bytes, 0, "fLaC")) readFlac(bytes, tags);
		else if (startsWith(bytes, 0, "OggS")) readOgg(bytes, tags);
		else if (startsWith(bytes, 4, "ftyp")) readMp4(bytes, tags);
	} catch {
		// a truncated or malformed tag keeps what was read before it
	}

	return tags;
}

function readId3(bytes: Uint8Array, tags: AudioTags) {
	const version = bytes[3];
	const flags = bytes[5];
	const tagSize = syncsafe(bytes, 6);
	let tag = bytes.subarray(10, 10 + tagSize);
	if (version < 4 && flags & 0x80) tag = withoutUnsynchronisation(tag);

	let offset = 0;
	if (flags & 0x40) {
		offset = version === 4 ? syncsafe(tag, 0) : uint32(tag, 0) + 4;
	}

	const idLength = version === 2 ? 3 : 4;
	const headerLength = version === 2 ? 6 : 10;
	while (offset + headerLength <= tag.length) {
		const id = latin1(tag.subarray(offset, offset + idLength));
		if (!/^[A-Z0-9]+$/.test(id)) break;

		const size =
			version === 2
				? (tag[offset + 3] << 16) | (tag[offset + 4] << 8) | tag[offset + 5]
				: version === 4
					? syncsafe(tag, offset + 4)
					: uint32(tag, offset + 4);
		const frameFlags = version === 2 ? 0 : tag[offset + 9];
		let frame = tag.subarray(
			offset + headerLength,
			offset + headerLength + size,
		);
		offset += headerLength + size;

		// compressed or encrypted, v2.3 and v2.4 flag bits
		const isUnreadable =
			version === 4 ? frameFlags & 0x0c : version === 3 && frameFlags & 0xc0;
		if (isUnreadable) continue;
		if (version === 4 && frameFlags & 0x01) frame = frame.subarray(4);
		if (version === 4 && frameFlags & 0x02) {
			frame = withoutUnsynchronisation(frame);
		}

		if (id === "TIT2" || id === "TT2") tags.title ??= id3Text(frame);
		else if (id === "TPE1" || id === "TP1") tags.artist ??= id3Text(frame);
	}
}

function id3Text(frame: Uint8Array) {
	const values = decodeId3(frame.subarray(1), frame[0])
		.split("\0")
		.map((value) => value.trim())
		.filter(Boolean);

	return values.length > 0 ? values.join(", ") : null;
}

function decodeId3(bytes: Uint8Array, encoding: number) {
	switch (encoding) {
		case 1: {
			// the BOM says the byte order, the decoder itself doesn't switch on it
			const isBigEndian = bytes[0] === 0xfe && bytes[1] === 0xff;

			return new TextDecoder(isBigEndian ? "utf-16be" : "utf-16le")
				.decode(bytes)
				.replaceAll("\uFEFF", "");
		}
		case 2:
			return new TextDecoder("utf-16be").decode(bytes);
		case 3:
			return new TextDecoder("utf-8").decode(bytes);
		default:
			return latin1(bytes);
	}
}

function readFlac(bytes: Uint8Array, tags: AudioTags) {
	let offset = 4;
	let isLast = false;
	while (!isLast && offset + 4 <= bytes.length) {
		const header = bytes[offset];
		isLast = Boolean(header & 0x80);
		const type = header & 0x7f;
		const size =
			(bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
		const block = bytes.subarray(offset + 4, offset + 4 + size);
		offset += 4 + size;

		if (type === 4) readVorbisComments(block, tags);
	}
}

/** The comment header of an Ogg file's first stream, Vorbis or Opus. */
function readOgg(bytes: Uint8Array, tags: AudioTags) {
	const header = oggPacket(bytes, 1);
	if (!header) return;

	if (startsWith(header, 0, "\x03vorbis")) {
		readVorbisComments(header.subarray(7), tags);
	} else if (startsWith(header, 0, "OpusTags")) {
		readVorbisComments(header.subarray(8), tags);
	}
}

/** The packet of the given index of the first stream, put together from the pages it spans. */
function oggPacket(bytes: Uint8Array, packetIndex: number) {
	let offset = 0;
	let serial: number | null = null;
	let index = 0;
	let parts: Uint8Array[] = [];

	while (offset + 27 <= bytes.length && startsWith(bytes, offset, "OggS")) {
		const pageSerial = uint32LittleEndian(bytes, offset + 14);
		const segmentCount = bytes[offset + 26];
		const segments = bytes.subarray(offset + 27, offset + 27 + segmentCount);
		let dataOffset = offset + 27 + segmentCount;
		serial ??= pageSerial;

		for (const segmentSize of segments) {
			if (pageSerial === serial && index === packetIndex) {
				parts.push(bytes.subarray(dataOffset, dataOffset + segmentSize));
			}
			dataOffset += segmentSize;
			if (segmentSize < 255 && pageSerial === serial) {
				if (index === packetIndex) return concat(parts);
				index++;
				parts = [];
			}
		}
		offset = dataOffset;
	}

	return null;
}

/** Vendor string then `KEY=value` comments. */
function readVorbisComments(block: Uint8Array, tags: AudioTags) {
	let offset = 4 + uint32LittleEndian(block, 0);
	const count = uint32LittleEndian(block, offset);
	offset += 4;

	for (let i = 0; i < count && offset + 4 <= block.length; i++) {
		const length = uint32LittleEndian(block, offset);
		const comment = new TextDecoder("utf-8").decode(
			block.subarray(offset + 4, offset + 4 + length),
		);
		offset += 4 + length;

		const separator = comment.indexOf("=");
		const key = comment.slice(0, separator).toUpperCase();
		const value = comment.slice(separator + 1).trim();
		if (separator === -1 || !value) continue;

		if (key === "TITLE") tags.title ??= value;
		else if (key === "ARTIST") tags.artist ??= value;
	}
}

/** `moov.udta.meta.ilst` of an MP4 file: its `©nam` and `©ART` items. */
function readMp4(bytes: Uint8Array, tags: AudioTags) {
	const moov = mp4Child(bytes, "moov");
	const udta = moov && mp4Child(moov, "udta");
	const meta = udta && mp4Child(udta, "meta");
	// a full box, its version and flags before its children
	const ilst = meta && mp4Child(meta.subarray(4), "ilst");
	if (!ilst) return;

	for (const item of mp4Children(ilst)) {
		const data = mp4Child(item.body, "data");
		if (!data || data.length < 8) continue;

		const dataType = uint32(data, 0) & 0xffffff;
		const value = data.subarray(8);
		if (item.type === "©nam" && dataType === MP4_TEXT_TYPE) {
			tags.title ??= utf8OrNull(value);
		} else if (item.type === "©ART" && dataType === MP4_TEXT_TYPE) {
			tags.artist ??= utf8OrNull(value);
		}
	}
}

function mp4Child(bytes: Uint8Array, type: string) {
	return mp4Children(bytes).find((child) => child.type === type)?.body ?? null;
}

function mp4Children(bytes: Uint8Array) {
	const children: Array<{ type: string; body: Uint8Array }> = [];
	let offset = 0;
	while (offset + 8 <= bytes.length) {
		let size = uint32(bytes, offset);
		let headerLength = 8;
		if (size === 1) {
			size = uint32(bytes, offset + 8) * 2 ** 32 + uint32(bytes, offset + 12);
			headerLength = 16;
		} else if (size === 0) {
			size = bytes.length - offset;
		}
		if (size < headerLength) break;

		children.push({
			type: latin1(bytes.subarray(offset + 4, offset + 8)),
			body: bytes.subarray(offset + headerLength, offset + size),
		});
		offset += size;
	}

	return children;
}

function withoutUnsynchronisation(bytes: Uint8Array) {
	const result: number[] = [];
	for (let i = 0; i < bytes.length; i++) {
		result.push(bytes[i]);
		if (bytes[i] === 0xff && bytes[i + 1] === 0x00) i++;
	}

	return Uint8Array.from(result);
}

function utf8OrNull(bytes: Uint8Array) {
	return new TextDecoder("utf-8").decode(bytes).trim() || null;
}

function startsWith(bytes: Uint8Array, offset: number, text: string) {
	for (let i = 0; i < text.length; i++) {
		if (bytes[offset + i] !== text.charCodeAt(i)) return false;
	}

	return true;
}

function latin1(bytes: Uint8Array) {
	return String.fromCharCode(...bytes);
}

function syncsafe(bytes: Uint8Array, offset: number) {
	return (
		((bytes[offset] & 0x7f) << 21) |
		((bytes[offset + 1] & 0x7f) << 14) |
		((bytes[offset + 2] & 0x7f) << 7) |
		(bytes[offset + 3] & 0x7f)
	);
}

function uint32(bytes: Uint8Array, offset: number) {
	return (
		((bytes[offset] << 24) >>> 0) +
		((bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3])
	);
}

function uint32LittleEndian(bytes: Uint8Array, offset: number) {
	return (
		(bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16)) +
		((bytes[offset + 3] << 24) >>> 0)
	);
}

function concat(parts: Uint8Array[]) {
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
