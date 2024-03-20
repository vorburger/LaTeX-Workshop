import * as path from 'path'
import * as process from 'process'
import * as tmpFile from 'tmp'
import { runTests } from '@vscode/test-electron'

async function runTestSuites(metaSuite: 'unittest' | 'multiroot') {
    try {
        const extensionDevelopmentPath = path.resolve(__dirname, '../../')
        const extensionTestsPath = path.resolve(__dirname, './suites/index')

        await runTests({
            version: '1.74.0',
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs: [
                'test/fixtures/' + metaSuite + (metaSuite === 'multiroot' ? '/resource.code-workspace' : ''),
                '--user-data-dir=' + tmpFile.dirSync({ unsafeCleanup: true }).name,
                '--extensions-dir=' + tmpFile.dirSync({ unsafeCleanup: true }).name,
                '--disable-gpu'
            ],
            extensionTestsEnv: {
                LATEXWORKSHOP_CLI: '1'
            }
        })
    } catch (error) {
        console.error(error)
        console.error('Failed to run tests')
        process.exit(1)
    }
}

async function main() {
    try {
        await runTestSuites('unittest')
        // await runTestSuites('multiroot')
    } catch (err) {
        console.error('Failed to run tests')
        process.exit(1)
    }
}

void main()
