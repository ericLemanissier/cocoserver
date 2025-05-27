import { newOctokit } from './octokit.js'
import { readStream } from './stdlib.js'
import * as http from './http.js'

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { rm, mkdtemp, readFile, writeFile, stat } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pipeline } from 'node:stream/promises'
import { minimatch } from 'minimatch'

/*
export async function deleteRecipe(req, res) {

  return res.send()
}
  */

function request_to_path(req): Array<string> {
  let res: Array<string> = [
    req.params.name,
    req.params.version,
    req.params.user,
    req.params.channel,
  ]
  if ('rrev' in req.params) {
    res.push(req.params.rrev)
    if ('package' in req.params) {
      res.push(req.params.package)
      if ('prev' in req.params) {
        res.push(req.params.prev)
      }
    }
  }
  return res
}

export async function getRecipeLatest(req, res) {
  const { user, auth, octokit } = newOctokit(req, false)
  try {
    const { data: folder } = await octokit.rest.repos.getContent({
      owner: req.app.locals.owner,
      repo: req.app.locals.repo,
      path: request_to_path(req).join('/'),
      ref: req.app.locals.branch,
    })
    let latestRevision = {
      revision: null,
      time: 0,
    }
    if (!Array.isArray(folder)) {
      throw http.notFound(
        `Recipe missing: ${req.params.name}/${req.params.version}@${req.params.user}/${req.params.channel}`,
      )
    }
    for (const rev of folder) {
      if (rev.type != 'dir') continue
      let retries = 5
      while (retries-- > 0){
        const manifest = await fetch(
          `https://raw.githubusercontent.com/${req.app.locals.owner}/${req.app.locals.repo}/${req.app.locals.branch}/${rev.path}/export/conanmanifest.txt`,
        )
        if(!manifest.ok) {
          if(manifest.status == 404){
            await new Promise(f => setTimeout(f, 100));
            continue;
          }
          throw new http.Error(manifest.status, `Failed to fetch manifest for ${rev.path}`)
        }
        const content = await manifest.text()
        const timestamp = Number(content.split(/\r?\n/)[0])
        if (timestamp > latestRevision.time) {
          latestRevision.revision = rev.name
          latestRevision.time = timestamp
        }
        break
      }
    }
    res.status(200).send({
      revision: latestRevision.revision,
      time: new Date(latestRevision.time * 1000).toISOString(),
    })
  } catch (error) {
    console.warn("caught error", error)
    res.status(error.status).send(error.message)
  }
}

export async function getRecipeRevisions(req, res) {
  const { user, auth, octokit } = newOctokit(req, false)
  let revisions = new Array()
  try {
    const { data: folder } = await octokit.rest.repos.getContent({
      owner: req.app.locals.owner,
      repo: req.app.locals.repo,
      path: request_to_path(req).join('/'),
      ref: req.app.locals.branch,
    })
    // ignore non-directory responses
    if (!Array.isArray(folder)) {
      throw http.notFound(`Recipe missing: ${request_to_path(req).join('/')}`)
    }
    for (const rev of folder) {
      if (rev.type != 'dir') continue
      let retries = 5
      while (retries-- > 0){
        const manifest = await fetch(
          `https://raw.githubusercontent.com/${req.app.locals.owner}/${req.app.locals.repo}/${req.app.locals.branch}/${rev.path}/export/conanmanifest.txt`,
        )
        if(!manifest.ok) {
          if(manifest.status == 404){
            await new Promise(f => setTimeout(f, 100));
            continue;
          }
          throw new http.Error(manifest.status, `Failed to fetch manifest for ${rev.path}`)
        }
        const content = await manifest.text()
        const timestamp = Number(content.split(/\r?\n/)[0])
        revisions.push({
          revision: rev.name,
          time: new Date(timestamp * 1000).toISOString(),
        })
        break
      }
    }
  } catch (error) {
    if(error.status != 404) {
      console.warn("caught error", error)
      res.status(error.status).send(error.message)
    }
  }
  res.status(200).send({ revisions })
}
/*
export async function deleteRecipeRevision(req, res) {

  return res.send()
}
*/

export async function getPackageLatest(req, res) {
  const package_folder = [req.app.locals.folder, ...request_to_path(req)].join('/')
  let latestRevision = {
    revision: null,
    time: 0,
  }
  let revisions: Array<string> = []
  try {
    revisions = await req.app.locals.filen.fs().readdir({path: package_folder})
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.status(404).send()
      return
    }
    else throw error
  }
  if(revisions.length == 0)
  {
    res.status(404).send()
    return
  }
  for (const r of revisions) {
    const stat = await req.app.locals.filen.fs().stat({path: `${package_folder}/${r}`})
    let created_at = Number(stat.birthtimeMs)
    if(created_at > latestRevision.time) {
      latestRevision.revision = r
      latestRevision.time = created_at
    }
  }
  res.status(200).send({
    revision: latestRevision.revision,
    time: new Date(latestRevision.time).toISOString(),
  })
}

export async function getPackageRevisions(req, res) {
  const package_folder = [req.app.locals.folder, ...request_to_path(req)].join('/')
  let revisions = new Array()
  let rev_list : Array<string> = []
  try {
    rev_list = await req.app.locals.filen.fs().readdir({path: package_folder})
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.status(200).send({ revisions: [] })
      return
    }
    else throw error
  }
  for (const r of rev_list) {
    const stat = await req.app.locals.filen.fs().stat({path: `${package_folder}/${r}`})
    let created_at = Number(stat.birthtimeMs)
    revisions.push({
      revision: r,
      time: new Date(created_at).toISOString(),
    })
  }
  res.status(200).send({ revisions })
}

export async function deletePackageRevision(req, res) {
  await req.app.locals.filen.fs().rmdir({
    path: [req.app.locals.folder, ...request_to_path(req)].join('/')
  })
  res.status(200).send()
}

export async function getPackageRevisionFiles(req, res) {
  const package_folder = [req.app.locals.folder, ...request_to_path(req)].join('/')

  res.status(200).send({ files: Object.fromEntries(
    (await req.app.locals.filen.fs().readdir({path: package_folder})).map(file => [file, {}])
  ) })
  
}

export async function getPackageRevisionFile(req, res) {
  const package_folder = [req.app.locals.folder, ...request_to_path(req)].join('/')
  const destination_dir = await mkdtemp(join(tmpdir(), "rp"));
  await req.app.locals.filen.fs().download({
    path: `${package_folder}/${req.params.filename}`,
    destination: `${destination_dir}/${req.params.filename}`})
  res.status(200).send(await readFile(`${destination_dir}/${req.params.filename}`))
  await rm(destination_dir, { recursive: true, force: true })
}

export async function putPackageRevisionFile(req, res) {
  const package_folder = [req.app.locals.folder, ...request_to_path(req)].join('/')
  const source_dir = await mkdtemp(join(tmpdir(), "rp"));
  const pipe_res = await pipeline(req, createWriteStream(`${source_dir}/${req.params.filename}`))
  if( req.params.filename == "conaninfo.txt" ){
    const stats = await stat(`${source_dir}/${req.params.filename}`)
    if ( stats.size == 0 )
      await writeFile(`${source_dir}/${req.params.filename}`, "\n")
  }

  const uploaded_file = await req.app.locals.filen.fs().upload({
    path: `${package_folder}/${req.params.filename}`,
    source: `${source_dir}/${req.params.filename}`})
  res.status(201).send()
  await rm(source_dir, { recursive: true, force: true })
}

export async function getRecipeRevisionSearch(req, res) {
  const package_folder = [req.app.locals.folder, ...request_to_path(req)].join('/')
  let packages_list : Array<string> = []
  try {
    packages_list = await req.app.locals.filen.fs().readdir({path: package_folder})
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.status(200).send({})
      return
    }
    else{
      console.warn(error)
      throw error
    }
  }
  
  let packages = new Object()
  const destination_dir = await mkdtemp(join(tmpdir(), "rp"));
  for (const p of packages_list) {
    /*const last_rev = TBD
      await req.app.locals.filen.fs().download({
      path: join(package_folder, p, last_rev, 'conaninfo.txt'),
      destination: join(destination_dir, p, last_rev, 'conaninfo.txt')
    })*/
      packages[p] = {content: ''/*await readFile(join(destination_dir, r, last_rev, 'conaninfo.txt'))*/}
  }
  res.status(200).send(packages)
  await rm(destination_dir, { recursive: true, force: true })
}

export async function getRecipeRevisionFiles(req, res) {
  const { user, auth, octokit } = newOctokit(req, false)
  const { data: folder } = await octokit.rest.repos.getContent({
    owner: req.app.locals.owner,
    repo: req.app.locals.repo,
    path: `${request_to_path(req).join('/')}/export`,
    ref: req.app.locals.branch,
  })
  let files = {}
  // ignore non-directory responses
  if (!Array.isArray(folder)) {
    return
  }
  for (const file of folder) {
    if (file.type != 'file') continue
    files[file.name] = {}
  }
  res.status(200).send({ files })
}

export async function getRecipeRevisionFile(req, res) {
  return res.redirect(
    301,
    `https://github.com/${req.app.locals.owner}/${req.app.locals.repo}/raw/refs/heads/${req.app.locals.branch}/${request_to_path(req).join('/')}/export/${req.params.filename}`,
  )
}

export async function putRecipeRevisionFile(req, res) {
  const { user, auth, octokit } = newOctokit(req, true)
  const buffer: Buffer = await readStream(req)
  const base64String = buffer.toString('base64')

  try {
    const result = await octokit.rest.repos.createOrUpdateFileContents({
      owner: req.app.locals.owner,
      repo: req.app.locals.repo,
      content: base64String,
      message: `${req.params.name}/${req.params.version}@${req.params.user}/${req.params.channel}#${req.params.rrev} ${req.params.filename}`,
      path: `${request_to_path(req).join('/')}/export/${req.params.filename}`,
      branch: req.app.locals.branch,
    })
    return res.status(result.status).send()
  } catch (error) {
    console.warn("caught error", error)

    const result = await octokit.rest.repos.getContent({
      owner: req.app.locals.owner,
      repo: req.app.locals.repo,
      path: `${request_to_path(req).join('/')}/export/${req.params.filename}`,
      branch: req.app.locals.branch,
      mediaType: {
        format: "application/vnd.github.raw+json",
      },
    })

    if( "content" in result && result.content === base64String && "encoding" in result && result.encoding === "base64" )
      return

    res.status(error.status).send(error.message)
  }
}

export async function getSearch(req, res) {
  const repo_folder = await mkdtemp(join(tmpdir(), 'cocoserver-repo-'))
  await promisify(execFile)('git', [
    'clone',
    '--bare',
    '--depth=1',
    '--filter=blob:none',
    '-b',
    req.app.locals.branch,
    `https://github.com/${req.app.locals.owner}/${req.app.locals.repo}`,
    repo_folder,
  ])

  let folders = ['.']
  for (let i = 0; i < 4; i++) {
    let newFolders: Array<string> = []
    for (const f of folders) {
      if(f != '.') {
        let [name, version, user, channel] = f.split('/')
        let tokens = [name]
        if (version){
          tokens.push('/', version)
          if (user) {
            if (user != '_') tokens.push('@', user)
            if(channel) {
              if (channel != '_') tokens.push('/', channel)
            }
          }
        }
        let partial = ''
        for (const token of tokens) {
          partial += token
        }
        if (!minimatch(partial, req.query.q, { partial: true })) {
          continue
        }
      }
      const { stdout } = await promisify(execFile)(
        'git',
        ['ls-tree', req.app.locals.branch, '--name-only', `${f}/`],
        { cwd: repo_folder },
      )
      newFolders.push(...stdout.split('\n').filter((x) => x))
    }
    folders = newFolders
  }
  await rm(repo_folder, { recursive: true, force: true })

  const results = []
  for (const f of folders) {
    let [name, version, user, channel] = f.split('/')
    let tokens = [name, '/', version]
    if (user != '_') tokens.push('@', user)
    if (channel != '_') tokens.push('/', channel)
    let partial = ''
    for (const token of tokens) {
      partial += token
      if (minimatch(partial, req.query.q)) {
        results.push(tokens.join(''))
        break
      }
    }
  }
  return res.send({ results })
}
