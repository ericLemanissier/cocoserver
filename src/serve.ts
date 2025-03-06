#!/usr/bin/env node
import express from 'express'
import router from './router.js'
import { Command } from 'commander'
import { FilenSDK } from '@filen/sdk'

const program = new Command()
program.option('-p, --port <port>', 'port number', '9595')
program.option('-o, --owner <owner>', 'github owner of the repository for storing recipes', 'ericLemanissier')
program.option('-r, --repo <repo>', 'github repository for storing recipes', 'conan-community-index')
program.option('-b, --branch <branch>', 'Github Branch for storing recipes', 'conan_remote')
program.option('-f, --folder <folder>', 'Filen folder for storing binaries', 'cocorepo')
program.parse(process.argv)
const { port, owner, repo, branch, folder } = program.opts()

const app = express()

app.locals.owner = owner
app.locals.repo = repo
app.locals.branch = branch
app.locals.folder = folder

app.locals.filen = new FilenSDK()
await app.locals.filen.login({email: process.env.FILEN_EMAIL, password: process.env.FILEN_PASSWORD})

app.set('trust proxy', true)

app.use(router)

app.listen(port, () => {
  console.log(`listening on port ${port}`)
})
