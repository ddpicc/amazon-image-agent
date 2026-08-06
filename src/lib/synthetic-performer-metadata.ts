const XMP_PACKET = Buffer.from(`<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:subject><rdf:Bag><rdf:li>contains-synthetic-performer</rdf:li></rdf:Bag></dc:subject></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`, 'utf8')

function crc32(buffer: Buffer) {
  let crc = 0xffffffff
  for (let index = 0; index < buffer.length; index += 1) {
    const byte = buffer[index]
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Buffer) {
  const chunkType = Buffer.from(type, 'ascii')
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(Buffer.concat([chunkType, data])))
  return Buffer.concat([length, chunkType, data, checksum])
}

function addPngMetadata(image: Buffer) {
  const signatureLength = 8
  const ihdrLength = image.readUInt32BE(signatureLength)
  const ihdrChunkEnd = signatureLength + 12 + ihdrLength
  const xmpData = Buffer.concat([
    Buffer.from('XML:com.adobe.xmp\0\0\0\0\0', 'ascii'),
    XMP_PACKET,
  ])
  return Buffer.concat([
    image.subarray(0, ihdrChunkEnd),
    pngChunk('iTXt', xmpData),
    image.subarray(ihdrChunkEnd),
  ])
}

function addJpegMetadata(image: Buffer) {
  const identifier = Buffer.from('http://ns.adobe.com/xap/1.0/\0', 'ascii')
  const payload = Buffer.concat([identifier, XMP_PACKET])
  const segment = Buffer.alloc(4)
  segment[0] = 0xff
  segment[1] = 0xe1
  segment.writeUInt16BE(payload.length + 2, 2)
  return Buffer.concat([image.subarray(0, 2), segment, payload, image.subarray(2)])
}

function addWebpMetadata(image: Buffer) {
  const padding = XMP_PACKET.length % 2 === 0 ? Buffer.alloc(0) : Buffer.alloc(1)
  const xmpChunk = Buffer.concat([
    Buffer.from('XMP ', 'ascii'),
    Buffer.from(Uint8Array.of(XMP_PACKET.length & 0xff, (XMP_PACKET.length >>> 8) & 0xff, (XMP_PACKET.length >>> 16) & 0xff, (XMP_PACKET.length >>> 24) & 0xff)),
    XMP_PACKET,
    padding,
  ])
  const result = Buffer.concat([image, xmpChunk])
  result.writeUInt32LE(result.length - 8, 4)
  return result
}

export function addSyntheticPerformerMetadata(image: Buffer): Buffer | null {
  if (image.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return addPngMetadata(image)
  }

  if (image[0] === 0xff && image[1] === 0xd8) {
    return addJpegMetadata(image)
  }

  if (image.subarray(0, 4).toString('ascii') === 'RIFF' && image.subarray(8, 12).toString('ascii') === 'WEBP') {
    return addWebpMetadata(image)
  }

  return null
}
