export function success(code: number) {
  return Math.floor(code / 100) === 2
}

// https://github.com/Microsoft/TypeScript/wiki/FAQ#why-doesnt-extending-built-ins-like-error-array-and-map-work
export class Error extends globalThis.Error {
  constructor(
    public code: number,
    message: string,
  ) {
    super(message)
  }
}

export function badRequest(message: string) {
  return new Error(400, message)
}

export function forbidden(message: string) {
  return new Error(403, message)
}

export function notFound(message: string) {
  return new Error(404, message)
}

export function badGateway(message: string) {
  return new Error(502, message)
}

export function conflict(message: string) {
  return new Error(409, message)
}

export function authenticationException(message: string) {
  return new Error(401, message)
}
