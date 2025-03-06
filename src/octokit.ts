import { Octokit } from 'octokit'
import { badRequest, authenticationException } from './http.js'
import { Buffer } from 'node:buffer'

/**
 * In the Authorization header, the bearer token is the base64-encoded string
 * `{user}:{auth}`.
 */
export function parseBearer(req) {
  const header = req.get('Authorization')
  if (!header) {
    const { user, auth } = req.query
    if (user && auth) {
      return { user, auth }
    }
    throw authenticationException('Missing header: Authorization')
  }
  const m1 = header.match(/^Bearer\s+(\S+?)\s*$/)
  if (!m1) {
    throw badRequest('Malformed header: Authorization')
  }
  const userpass = Buffer.from(m1[1], 'base64').toString('ascii')
  const m2 = userpass.match(/([^:]+):(.+)/)
  if (!m2) {
    throw badRequest('Malformed header: Authorization')
  }
  const user = m2[1]
  const auth = m2[2]
  return { user, auth }
}

export function newOctokit(req, write = false) {
  let user = '<anonymous>'
  let auth = undefined
  try {
    ({ user, auth } = parseBearer(req))
  } catch (cause) {
    if (write) {
      throw cause
    }
  }
  let octokit = new Octokit({ auth })
  return { user, auth, octokit }
}
