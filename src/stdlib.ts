import { Buffer } from 'node:buffer'

export function readStream(stream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let data = []
    stream.on('data', (chunk) => data.push(chunk))
    stream.on('end', () => resolve(Buffer.concat(data)))
    stream.on('error', (error) => reject(error))
  })
}
