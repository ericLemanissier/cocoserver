import { Buffer } from 'node:buffer'
import * as stream from "node:stream";

export function readStream(stream: stream.Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const data: Uint8Array[] = []
    stream.on('data', (chunk: Uint8Array) => {
      data.push(chunk)
    })
    stream.on('end', () => {
      resolve(Buffer.concat(data))
    })
    stream.on('error', (error) => {
      reject(error)
    })
  })
}
