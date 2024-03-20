import * as vscode from 'vscode'
import * as os from 'os'
import * as sinon from 'sinon'
import rewire from 'rewire'
import * as assert from 'assert'
import * as path from 'path'
import { lw } from '../../src/lw'
console.log(lw.file.getOutDir())

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

function getContext(...paths: string[]) {
    return path.resolve(
        vscode.workspace.workspaceFile?.fsPath ?? vscode.workspace.workspaceFolders?.[0].uri.fsPath ?? '',
        path.basename(__filename).split('.')[0],
        ...paths
    ).replaceAll(path.sep, '/')
}

function setRoot(fixture: string, root: string) {
    const context = getContext(fixture)
    sinon.stub(lw.root.file, 'path').value(path.resolve(context, root))
    sinon.stub(lw.root.dir, 'path').value(context)
    sinon.stub(lw.compile, 'lastSteps').value([])
}
function resetRoot() {
    sinon.stub(lw.root.file, 'path').value(undefined)
    sinon.stub(lw.root.dir, 'path').value(undefined)
    sinon.stub(lw.compile, 'lastSteps').value([])
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
        resetRoot()
        await resetConfig()
    })

    after(() => {
        sinon.restore()
    })

    describe('temporary directory creation', () => {
        it('should create temporary directories', () => {
            assert.ok(createTmpDir())
        })

        it('should create different temporary directories', () => {
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

        it('should alert temporary directory name with quotes', () => {
            forbiddenTemp(['\'', '"'])
        })

        it('should alert temporary directory name with forbidden characters', () => {
            forbiddenTemp(['/'])
        })
    })

    describe('output directory getter', () => {
        it('should get output directory from root', () => {
            setRoot('01', 'main.tex')
            assert.strictEqual(lw.file.getOutDir(), lw.root.dir.path)
        })

        it('should get output directory without root or input latex', () => {
            assert.strictEqual(lw.file.getOutDir(), './')
        })

        it('should get output directory with an input latex', () => {
            assert.strictEqual(lw.file.getOutDir('/path/to/file.tex'), '/path/to')
        })

        it('should get output directory with an input latex over the root', () => {
            setRoot('01', 'main.tex')
            assert.strictEqual(lw.file.getOutDir('/path/to/file.tex'), '/path/to')
        })

        it('should get output directory with absolute `latex.outDir` and root', async () => {
            await setConfig('latex.outDir', '/output')
            setRoot('01', 'main.tex')
            assert.strictEqual(lw.file.getOutDir(), '/output')
        })

        it('should get output directory with relative `latex.outDir` and root', async () => {
            await setConfig('latex.outDir', 'output')
            setRoot('01', 'main.tex')
            assert.strictEqual(lw.file.getOutDir(), 'output')
        })

        it('should get output directory with relative `latex.outDir` with leading `./` and root', async () => {
            await setConfig('latex.outDir', './output')
            setRoot('01', 'main.tex')
            assert.strictEqual(lw.file.getOutDir(), 'output')
        })

        it('should get output directory with relative `latex.outDir`, root, and an input latex', async () => {
            await setConfig('latex.outDir', 'output')
            setRoot('01', 'main.tex')
            assert.strictEqual(lw.file.getOutDir('/path/to/file.tex'), 'output')
        })

        it('should get output directory with placeholder in `latex.outDir` and root', async () => {
            await setConfig('latex.outDir', '%DIR%')
            setRoot('01', 'main.tex')
            assert.strictEqual(lw.file.getOutDir(), lw.root.dir.path)
        })

        it('should get output directory with placeholder in `latex.outDir`, root, and an input latex', async () => {
            await setConfig('latex.outDir', '%DIR%')
            setRoot('01', 'main.tex')
            assert.strictEqual(lw.file.getOutDir('/path/to/file.tex'), '/path/to')
        })

        it('should get output directory from last compilation if `latex.outDir` is `%DIR%`', async () => {
            await setConfig('latex.outDir', '%DIR%')
            setRoot('01', 'main.tex')
            sinon.stub(lw.compile, 'lastSteps').value([{ outdir: '/trap' }, { outdir: '/output' }])
            assert.strictEqual(lw.file.getOutDir(), '/output')
        })

        it('should get output directory from last compilation `outdir` is recorded in steps other than the last one', async () => {
            await setConfig('latex.outDir', '%DIR%')
            setRoot('01', 'main.tex')
            sinon.stub(lw.compile, 'lastSteps').value([{ outdir: '/output' }, { }])
            assert.strictEqual(lw.file.getOutDir(), '/output')
        })

        it('should ignore output directory from last compilation if `latex.outDir` is not `%DIR%`', async () => {
            await setConfig('latex.outDir', '/output')
            setRoot('01', 'main.tex')
            sinon.stub(lw.compile, 'lastSteps').value([{ outdir: '/trap' }])
            assert.strictEqual(lw.file.getOutDir(), '/output')
        })

        it('should ignore output directory from last compilation if no `outdir` is recorded', async () => {
            await setConfig('latex.outDir', '%DIR%')
            setRoot('01', 'main.tex')
            sinon.stub(lw.compile, 'lastSteps').value([{ }])
            assert.strictEqual(lw.file.getOutDir(), lw.root.dir.path)
        })

        it('should handle empty `latex.outDir` correctly', async () => {
            await setConfig('latex.outDir', '')
            setRoot('01', 'main.tex')
            assert.strictEqual(lw.file.getOutDir(), './')
        })

        it('should handle absolute `latex.outDir` with trailing slashes correctly', async () => {
            await setConfig('latex.outDir', '/output/')
            setRoot('01', 'main.tex')
            assert.strictEqual(lw.file.getOutDir(), '/output')
        })

        it('should handle relative `latex.outDir` with trailing slashes correctly', async () => {
            await setConfig('latex.outDir', 'output/')
            setRoot('01', 'main.tex')
            assert.strictEqual(lw.file.getOutDir(), 'output')
        })

        it('should normalize output directory paths correctly on Windows', () => {
            if (os.platform() === 'win32') {
                assert.strictEqual(lw.file.getOutDir('C:\\path\\to\\file.tex'), 'C:/path/to')
            } else {
                assert.ok(true)
            }
        })
    })

    describe('.fls path getter', () => {
        it('should return the correct path when .fls exists in the output directory', () => {
            assert.strictEqual(lw.file.getFlsPath(getContext('01', 'main.tex')), getContext('01', 'main.fls'))
        })

        it('should return undefined when .fls does not exist in the output directory', () => {
            assert.strictEqual(lw.file.getFlsPath(getContext('01', 'nonexistent.tex')), undefined)
        })

        it('should respect custom output directory when config is set', async () => {
            await setConfig('latex.outDir', 'output')
            assert.strictEqual(lw.file.getFlsPath(getContext('01', 'main.tex')), getContext('01', 'output', 'main.fls'))
        })

        it('should handle when `auxdir` is missing in last compilation', () => {
            sinon.stub(lw.compile, 'lastSteps').value([{ }])
            assert.strictEqual(lw.file.getFlsPath(getContext('01', 'main.tex')), getContext('01', 'main.fls'))
        })

        it('should handle when `auxdir` is available in last compilation, but another .fls file in the output folder has higher priority', () => {
            sinon.stub(lw.compile, 'lastSteps').value([{ auxdir: 'auxfiles' }])
            assert.strictEqual(lw.file.getFlsPath(getContext('01', 'main.tex')), getContext('01', 'main.fls'))
        })

        it('should handle when `auxdir` is available in last compilation', () => {
            sinon.stub(lw.compile, 'lastSteps').value([{ auxdir: 'auxfiles' }])
            assert.strictEqual(lw.file.getFlsPath(getContext('01', 'another.tex')), getContext('01', 'auxfiles', 'another.fls'))
        })

        it('should handle when `auxdir` is available in last compilation but not the last step', () => {
            sinon.stub(lw.compile, 'lastSteps').value([{ auxdir: 'auxfiles' }, { }])
            assert.strictEqual(lw.file.getFlsPath(getContext('01', 'another.tex')), getContext('01', 'auxfiles', 'another.fls'))
        })
    })

    describe('other getters', () => {
        it('should return "latex" for .tex files', () => {
            assert.strictEqual(lw.file.getLangId('example.tex'), 'latex')
        })

        it('should return "pweave" for Pweave extensions', () => {
            assert.strictEqual(lw.file.getLangId('example.pnw'), 'pweave')
            assert.strictEqual(lw.file.getLangId('example.ptexw'), 'pweave')
        })

        it('should return "jlweave" for JLweave extensions', () => {
            assert.strictEqual(lw.file.getLangId('example.jnw'), 'jlweave')
            assert.strictEqual(lw.file.getLangId('example.jtexw'), 'jlweave')
        })

        it('should return "rsweave" for RSweave extensions', () => {
            assert.strictEqual(lw.file.getLangId('example.rnw'), 'rsweave')
            assert.strictEqual(lw.file.getLangId('example.Rnw'), 'rsweave')
            assert.strictEqual(lw.file.getLangId('example.rtex'), 'rsweave')
            assert.strictEqual(lw.file.getLangId('example.Rtex'), 'rsweave')
            assert.strictEqual(lw.file.getLangId('example.snw'), 'rsweave')
            assert.strictEqual(lw.file.getLangId('example.Snw'), 'rsweave')
        })

        it('should return "doctex" for .dtx files', () => {
            assert.strictEqual(lw.file.getLangId('example.dtx'), 'doctex')
        })

        it('should return undefined for unknown file extensions', () => {
            assert.strictEqual(lw.file.getLangId('example.unknown'), undefined)
        })

        it('should handle mixed case file extensions correctly', () => {
            assert.strictEqual(lw.file.getLangId('example.TeX'), 'latex')
        })

        it('should handle paths with folders correctly', () => {
            assert.strictEqual(lw.file.getLangId('folder/example.tex'), 'latex')
        })

        it('should return the jobname if present in configuration', async () => {
            await setConfig('latex.jobname', 'myJob')
            assert.strictEqual(lw.file.getJobname('/path/to/file.tex'), 'myJob')
        })

        it('should return the name of the input texPath if jobname is empty', async () => {
            await setConfig('latex.jobname', '')
            const texPath = '/path/to/file.tex'
            const expectedJobname = path.parse(texPath).name
            assert.strictEqual(lw.file.getJobname(texPath), expectedJobname)
        })

        it('should return the name of the input texPath if configuration is not set', async () => {
            await setConfig('latex.jobname', undefined) // Ensuring the jobname is not set
            const texPath = '/path/to/file.tex'
            const expectedJobname = path.parse(texPath).name
            assert.strictEqual(lw.file.getJobname(texPath), expectedJobname)
        })

        it('should return the correct PDF path when outDir is empty', async () => {
            await setConfig('latex.outDir', '')
            setRoot('01', 'main.tex')
            const texpath = lw.root.file.path ?? ''
            assert.strictEqual(lw.file.getPdfPath(texpath), texpath.replaceAll(path.sep, '/').replaceAll('.tex', '.pdf'))
        })

        it('should return the correct PDF path when outDir is specified', async () => {
            await setConfig('latex.outDir', 'output')
            setRoot('01', 'main.tex')
            const texpath = lw.root.file.path ?? ''
            assert.strictEqual(lw.file.getPdfPath(texpath), texpath.replaceAll(path.sep, '/').replaceAll('main.tex', 'output/main.pdf'))
        })

        it('should handle spaces in file paths correctly', () => {
            setRoot('01', 'document with spaces.tex')
            const texpath = lw.root.file.path ?? ''
            assert.strictEqual(lw.file.getPdfPath(texpath), texpath.replaceAll(path.sep, '/').replaceAll('.tex', '.pdf'))
        })

        it('should handle special characters in file names correctly', () => {
            setRoot('01', 'special_!@#$%^&*()-_=+[]{}\'`~,.<>?.tex')
            const texpath = lw.root.file.path ?? ''
            assert.strictEqual(lw.file.getPdfPath(texpath), texpath.replaceAll(path.sep, '/').replaceAll('.tex', '.pdf'))
        })
    })

    // hasBinaryExt,
    // hasTeXExt,
    // hasTexLangId,
    // hasBibLangId,
    // hasDtxLangId,
    // exists,
    // read,
    // kpsewhich,
})
