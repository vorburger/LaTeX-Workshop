import * as vscode from 'vscode'
import * as sinon from 'sinon'
import rewire from 'rewire'
import * as assert from 'assert'
import * as path from 'path'
import { lw } from '../../src/lw'

function stubObject(obj: any, ignore?: string) {
    Object.getOwnPropertyNames(obj).forEach(item => {
        // Don't stub the unit to be tested or the logging functions.
        if (item === ignore ||
            (ignore !== undefined && item === 'log')) {
            return
        }
        if (typeof obj[item] === 'object') {
            stubObject(obj[item])
        } else if (typeof obj[item] === 'function') {
            sinon.stub(obj, item)
        }
    })
}

let shouldResetRoot = false
function setRoot(fixture: string, root: string) {
    const context = path.resolve(
        vscode.workspace.workspaceFile?.fsPath ?? vscode.workspace.workspaceFolders?.[0].uri.fsPath ?? '',
        path.basename(__filename).split('.')[0],
        fixture
    )
    sinon.stub(lw.root.file, 'path').value(path.resolve(context, root))
    sinon.stub(lw.root.dir, 'path').value(context)
    sinon.stub(lw.compile, 'lastSteps').value([])
    shouldResetRoot = true
}
function resetRoot() {
    sinon.stub(lw.root.file, 'path').value(undefined)
    sinon.stub(lw.root.dir, 'path').value(undefined)
    sinon.stub(lw.compile, 'lastSteps')
    shouldResetRoot = false
}

const changedConfigs: Set<string> = new Set()
async function setConfig(section: string, value: any) {
    await vscode.workspace.getConfiguration('latex-workshop').update(section, value)
    changedConfigs.add(section)
}
async function resetConfig() {
    for (const section of changedConfigs.values()) {
        await setConfig(section, undefined)
    }
    changedConfigs.clear()
}

describe(path.basename(__filename).split('.')[0] + ':', () => {
    const createTmpDir = rewire('../../src/core/file').__get__('createTmpDir') as () => string

    before(() => {
        stubObject(lw, 'file')
        resetRoot()
    })

    afterEach(async () => {
        if (shouldResetRoot) {
            resetRoot()
        }
        await resetConfig()
    })

    after(() => {
        sinon.restore()
    })

    describe('temporary directory creation', () => {
        it('can create temporary directories', () => {
            assert.ok(createTmpDir())
        })

        it('can create different temporary directories', () => {
            assert.notEqual(createTmpDir(), createTmpDir())
        })

        function forbiddenTemp(chars: string[]) {
            const tmp = process.env.TMP ?? process.env.TEMP ?? process.env.TMPDIR
            const tmpNames = ['TMP', 'TEMP', 'TMPDIR']
            chars.forEach(char => {
                tmpNames.forEach(envvar => process.env[envvar] = (process.env[envvar] === undefined ? undefined : ('\\Test ' + char)))
                try {
                    createTmpDir()
                    assert.ok(false)
                } catch {
                    assert.ok(true)
                } finally {
                    tmpNames.forEach(envvar => { if (process.env[envvar] !== undefined) { process.env[envvar] = tmp } })
                }
            })
        }

        it('can alert temporary directory name with quotes', () => {
            forbiddenTemp(['\'', '"'])
        })

        it('can alert temporary directory name with forbidden characters', () => {
            forbiddenTemp(['/'])
        })
    })

    describe('output directory getter', () => {
        it('can get output directory from root', () => {
            setRoot('01', 'main.tex')
            assert.equal(lw.file.getOutDir(), lw.root.dir.path)
        })

        it('can get output directory without root or input latex', () => {
            assert.equal(lw.file.getOutDir(), './')
        })

        it('can get output directory with an input latex', () => {
            assert.equal(lw.file.getOutDir('/project/sub.tex'), '/project')
        })

        it('can get output directory with an input latex over the root', () => {
            setRoot('01', 'main.tex')
            assert.equal(lw.file.getOutDir('/project/sub.tex'), '/project')
        })

        it('can get output directory with absolute `latex.outDir` and root', async () => {
            await setConfig('latex.outDir', '/out')
            setRoot('01', 'main.tex')
            assert.equal(lw.file.getOutDir(), '/out')
        })

        it('can get output directory with relative `latex.outDir` and root', async () => {
            await setConfig('latex.outDir', './out')
            setRoot('01', 'main.tex')
            assert.equal(lw.file.getOutDir(), 'out')
        })

        it('can get output directory with relative `latex.outDir`, root, and an input latex', async () => {
            await setConfig('latex.outDir', './out')
            setRoot('01', 'main.tex')
            assert.equal(lw.file.getOutDir('/project/sub.tex'), 'out')
        })

        it('can get output directory with placeholder in `latex.outDir` and root', async () => {
            await setConfig('latex.outDir', '%DIR%')
            setRoot('01', 'main.tex')
            assert.equal(lw.file.getOutDir(), lw.root.dir.path)
        })

        it('can get output directory with placeholder in `latex.outDir`, root, and an input latex', async () => {
            await setConfig('latex.outDir', '%DIR%')
            setRoot('01', 'main.tex')
            assert.equal(lw.file.getOutDir('/project/sub.tex'), '/project')
        })

        it('can get output directory from last compilation if `latex.outDir` is `%DIR%`', async () => {
            await setConfig('latex.outDir', '%DIR%')
            setRoot('01', 'main.tex')
            sinon.stub(lw.compile, 'lastSteps').value([{ outdir: '/trap' }, { outdir: '/out' }])
            assert.equal(lw.file.getOutDir(), '/out')
        })

        it('can ignore output directory from last compilation if `latex.outDir` is not `%DIR%`', async () => {
            await setConfig('latex.outDir', '/out')
            setRoot('01', 'main.tex')
            sinon.stub(lw.compile, 'lastSteps').value([{ outdir: '/trap' }])
            assert.equal(lw.file.getOutDir(), '/out')
        })
    })

    // tmpDirPath: createTmpDir(),
    // getOutDir,
    // getLangId,
    // getJobname,
    // getBibPath,
    // getPdfPath,
    // getFlsPath,
    // hasBinaryExt,
    // hasTeXExt,
    // hasTexLangId,
    // hasBibLangId,
    // hasDtxLangId,
    // exists,
    // read,
    // kpsewhich,
})
