import * as vscode from 'vscode'
import * as os from 'os'
import * as sinon from 'sinon'
import * as assert from 'assert'
import * as path from 'path'
import { lw } from '../../src/lw'
import { _tests } from '../../src/core/file'

function stubObject(obj: any, ignore?: string) {
    Object.getOwnPropertyNames(obj).forEach(item => {
        // Don't stub the unit to be tested or the logging/external functions.
        if (item === ignore ||
            (ignore !== undefined && ['log', 'external'].includes(item))) {
            return
        }
        if (typeof obj[item] === 'object') {
            stubObject(obj[item])
        } else if (typeof obj[item] === 'function') {
            sinon.stub(obj, item)
        }
    })
}

function getContext(...paths: string[ ]) {
    return path.resolve(
        vscode.workspace.workspaceFile?.fsPath ?? vscode.workspace.workspaceFolders?.[0].uri.fsPath ?? '',
        path.basename(__filename).split('.')[0],
        ...paths
    )
}

function setRoot(fixture: string, root: string) {
    let context = getContext(fixture)
    if (os.platform() === 'win32') {
        context = context.charAt(0).toUpperCase() + context.slice(1)
    }
    sinon.stub(lw.root.file, 'path').value(path.resolve(context, root))
    sinon.stub(lw.root.dir, 'path').value(context)
}
function resetRoot() {
    sinon.stub(lw.root.file, 'path').value(undefined)
    sinon.stub(lw.root.dir, 'path').value(undefined)
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

function pathEqual(path1?: string, path2?: string) {
    if (path1 === undefined || path2 === undefined) {
        assert.strictEqual(path1, path2)
    } else {
        assert.strictEqual(path1.replaceAll(path.sep, '/'), path2.replaceAll(path.sep, '/'))
    }
}

describe(path.basename(__filename).split('.')[0] + ':', () => {
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
            assert.ok(_tests?.createTmpDir())
        })

        it('should create different temporary directories', () => {
            assert.notEqual(_tests?.createTmpDir(), _tests?.createTmpDir())
        })

        function forbiddenTemp(chars: string[ ]) {
            const tmp = process.env.TMP ?? process.env.TEMP ?? process.env.TMPDIR
            const tmpNames = ['TMP', 'TEMP', 'TMPDIR']
            chars.forEach(char => {
                tmpNames.forEach(envvar => process.env[envvar] = (process.env[envvar] === undefined ? undefined : ('\\Test ' + char)))
                try {
                    _tests?.createTmpDir()
                    assert.fail('Expected an error to be thrown')
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

    describe('lw.file.getOutDir', () => {
        it('should get output directory from root', () => {
            setRoot('01', 'main.tex')
            pathEqual(lw.file.getOutDir(), lw.root.dir.path)
        })

        it('should get output directory without root or input latex', () => {
            pathEqual(lw.file.getOutDir(), './')
        })

        it('should get output directory with an input latex', () => {
            pathEqual(lw.file.getOutDir('/path/to/file.tex'), '/path/to')
        })

        it('should get output directory with an input latex over the root', () => {
            setRoot('01', 'main.tex')
            pathEqual(lw.file.getOutDir('/path/to/file.tex'), '/path/to')
        })

        it('should get output directory with absolute `latex.outDir` and root', async () => {
            await setConfig('latex.outDir', '/output')
            setRoot('01', 'main.tex')
            pathEqual(lw.file.getOutDir(), '/output')
        })

        it('should get output directory with relative `latex.outDir` and root', async () => {
            await setConfig('latex.outDir', 'output')
            setRoot('01', 'main.tex')
            pathEqual(lw.file.getOutDir(), 'output')
        })

        it('should get output directory with relative `latex.outDir` with leading `./` and root', async () => {
            await setConfig('latex.outDir', './output')
            setRoot('01', 'main.tex')
            pathEqual(lw.file.getOutDir(), 'output')
        })

        it('should get output directory with relative `latex.outDir`, root, and an input latex', async () => {
            await setConfig('latex.outDir', 'output')
            setRoot('01', 'main.tex')
            pathEqual(lw.file.getOutDir('/path/to/file.tex'), 'output')
        })

        it('should get output directory with placeholder in `latex.outDir` and root', async () => {
            await setConfig('latex.outDir', '%DIR%')
            setRoot('01', 'main.tex')
            pathEqual(lw.file.getOutDir(), lw.root.dir.path)
        })

        it('should get output directory with placeholder in `latex.outDir`, root, and an input latex', async () => {
            await setConfig('latex.outDir', '%DIR%')
            setRoot('01', 'main.tex')
            pathEqual(lw.file.getOutDir('/path/to/file.tex'), '/path/to')
        })

        it('should get output directory from last compilation if `latex.outDir` is `%DIR%`', async () => {
            await setConfig('latex.outDir', '%DIR%')
            setRoot('01', 'main.tex')
            lw.file.setTeXDirs(lw.root.file.path ?? '', '/output')
            pathEqual(lw.file.getOutDir(), '/output')
        })

        it('should ignore output directory from last compilation if `latex.outDir` is not `%DIR%`', async () => {
            await setConfig('latex.outDir', '/output')
            setRoot('01', 'main.tex')
            lw.file.setTeXDirs(lw.root.file.path ?? '', '/trap')
            pathEqual(lw.file.getOutDir(), '/output')
        })

        it('should ignore output directory from last compilation if no `outdir` is recorded', async () => {
            await setConfig('latex.outDir', '%DIR%')
            setRoot('01', 'main.tex')
            lw.file.setTeXDirs(lw.root.file.path ?? '')
            pathEqual(lw.file.getOutDir(), lw.root.dir.path)
        })

        it('should handle empty `latex.outDir` correctly', async () => {
            await setConfig('latex.outDir', '')
            setRoot('01', 'main.tex')
            pathEqual(lw.file.getOutDir(), './')
        })

        it('should handle absolute `latex.outDir` with trailing slashes correctly', async () => {
            await setConfig('latex.outDir', '/output/')
            setRoot('01', 'main.tex')
            pathEqual(lw.file.getOutDir(), '/output')
        })

        it('should handle relative `latex.outDir` with trailing slashes correctly', async () => {
            await setConfig('latex.outDir', 'output/')
            setRoot('01', 'main.tex')
            pathEqual(lw.file.getOutDir(), 'output')
        })

        it('should normalize output directory paths correctly on Windows', () => {
            if (os.platform() === 'win32') {
                pathEqual(lw.file.getOutDir('C:\\path\\to\\file.tex'), 'C:/path/to')
            } else {
                assert.ok(true)
            }
        })
    })

    describe('lw.file.getFlsPath', () => {
        it('should return the correct path when .fls exists in the output directory', () => {
            pathEqual(lw.file.getFlsPath(getContext('01', 'main.tex')), getContext('01', 'main.fls'))
        })

        it('should return undefined when .fls does not exist in the output directory', () => {
            pathEqual(lw.file.getFlsPath(getContext('01', 'nonexistent.tex')), undefined)
        })

        it('should respect custom output directory when config is set', async () => {
            await setConfig('latex.outDir', 'output')
            pathEqual(lw.file.getFlsPath(getContext('01', 'main.tex')), getContext('01', 'output', 'main.fls'))
        })

        it('should handle when `auxdir` is available in last compilation', () => {
            setRoot('01', 'another.tex')
            lw.file.setTeXDirs(lw.root.file.path ?? '', undefined, 'auxfiles')
            pathEqual(lw.file.getFlsPath(getContext('01', 'another.tex')), getContext('01', 'auxfiles', 'another.fls'))
        })

        it('should handle when `auxdir` is missing in last compilation', () => {
            setRoot('01', 'main.tex')
            lw.file.setTeXDirs(lw.root.file.path ?? '', '/output')
            pathEqual(lw.file.getFlsPath(getContext('01', 'main.tex')), getContext('01', 'main.fls'))
        })

        it('should handle when `auxdir` is available in last compilation, but another .fls file in the output folder has higher priority', () => {
            setRoot('01', 'main.tex')
            lw.file.setTeXDirs(lw.root.file.path ?? '', undefined, 'auxfiles')
            pathEqual(lw.file.getFlsPath(getContext('01', 'main.tex')), getContext('01', 'main.fls'))
        })
    })

    describe('lw.file.getBibPath', () => {
        it('should correctly find BibTeX files', () => {
            setRoot('01', 'main.tex')
            const result = lw.file.getBibPath('main.bib', lw.root.dir.path ?? '')
            assert.deepStrictEqual(result, [path.resolve(lw.root.dir.path ?? '', 'main.bib')])
        })

        it('should correctly find BibTeX files in basedir', () => {
            setRoot('01', 'main.tex')
            const result = lw.file.getBibPath('sub.bib', path.resolve(lw.root.dir.path ?? '', 'subdir'))
            assert.deepStrictEqual(result, [ path.resolve(lw.root.dir.path ?? '', 'subdir', 'sub.bib') ])
        })

        it('should correctly find BibTeX files in `latex.bibDirs`', async () => {
            setRoot('01', 'main.tex')
            await setConfig('latex.bibDirs', [ path.resolve(lw.root.dir.path ?? '', 'subdir') ])
            const result = lw.file.getBibPath('sub.bib', lw.root.dir.path ?? '')
            assert.deepStrictEqual(result, [ path.resolve(lw.root.dir.path ?? '', 'subdir', 'sub.bib') ])
        })

        it('should return an empty array when no BibTeX file is found', async () => {
            setRoot('01', 'main.tex')
            await setConfig('latex.bibDirs', [ path.resolve(lw.root.dir.path ?? '', 'subdir') ])
            const result = lw.file.getBibPath('nonexistent.bib', path.resolve(lw.root.dir.path ?? '', 'output'))
            assert.deepStrictEqual(result, [ ])
        })

        it('should correctly handle wildcard in BibTeX file name', () => {
            setRoot('01', 'main.tex')
            const result = lw.file.getBibPath('*.bib', lw.root.dir.path ?? '')
            assert.deepStrictEqual(result, [ path.resolve(lw.root.dir.path ?? '', 'main.bib'), path.resolve(lw.root.dir.path ?? '', 'another.bib') ])
        })

        it('should handle case when kpsewhich is disabled and BibTeX file not found', async () => {
            const stub = sinon.stub(lw.external, 'sync').returns({ pid: 0, status: 0, stdout: '/path/to/nonexistent.bib', output: [''], stderr: '', signal: 'SIGTERM' })
            await setConfig('kpsewhich.bibtex.enabled', false)
            setRoot('01', 'main.tex')
            const result = lw.file.getBibPath('nonexistent.bib', lw.root.dir.path ?? '')
            stub.restore()
            assert.deepStrictEqual(result, [ ])
        })

        it('should handle case when kpsewhich is enabled and BibTeX file not found', async () => {
            const stub = sinon.stub(lw.external, 'sync').returns({ pid: 0, status: 0, stdout: '/path/to/nonexistent.bib', output: [''], stderr: '', signal: 'SIGTERM' })
            await setConfig('kpsewhich.bibtex.enabled', true)
            setRoot('01', 'main.tex')
            const result = lw.file.getBibPath('nonexistent.bib', lw.root.dir.path ?? '')
            stub.restore()
            assert.deepStrictEqual(result, [ '/path/to/nonexistent.bib' ])
        })

        it('should return an empty array when kpsewhich is enabled but file is not found', async () => {
            const stub = sinon.stub(lw.external, 'sync').returns({ pid: 0, status: 0, stdout: '', output: [''], stderr: '', signal: 'SIGTERM' })
            await setConfig('kpsewhich.bibtex.enabled', true)
            setRoot('01', 'main.tex')
            const result = lw.file.getBibPath('another-nonexistent.bib', lw.root.dir.path ?? '')
            stub.restore()
            assert.deepStrictEqual(result, [ ])
        })
    })

    describe('lw.file.getLangId', () => {
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
    })

    describe('lw.file.getJobname', () => {
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
    })

    describe('lw.file.getPdfPath', () => {
        it('should return the correct PDF path when outDir is empty', async () => {
            await setConfig('latex.outDir', '')
            setRoot('01', 'main.tex')
            const texpath = lw.root.file.path ?? ''
            pathEqual(lw.file.getPdfPath(texpath), texpath.replaceAll('.tex', '.pdf'))
        })

        it('should return the correct PDF path when outDir is specified', async () => {
            await setConfig('latex.outDir', 'output')
            setRoot('01', 'main.tex')
            const texpath = lw.root.file.path ?? ''
            pathEqual(lw.file.getPdfPath(texpath), texpath.replaceAll('main.tex', 'output/main.pdf'))
        })

        it('should handle spaces in file paths correctly', () => {
            setRoot('01', 'document with spaces.tex')
            const texpath = lw.root.file.path ?? ''
            pathEqual(lw.file.getPdfPath(texpath), texpath.replaceAll('.tex', '.pdf'))
        })

        it('should handle special characters in file names correctly', () => {
            setRoot('01', 'special_!@#$%^&*()-_=+[ ]{}\'`~,.<>?.tex')
            const texpath = lw.root.file.path ?? ''
            pathEqual(lw.file.getPdfPath(texpath), texpath.replaceAll('.tex', '.pdf'))
        })
    })

    describe('lw.file.hasTeXExt', () => {
        it('should return true for supported TeX extensions', () => {
            assert.ok(lw.file.hasTeXExt('.tex'))
            assert.ok(lw.file.hasTeXExt('.rnw'))
            assert.ok(lw.file.hasTeXExt('.jnw'))
            assert.ok(lw.file.hasTeXExt('.pnw'))
        })

        it('should return false for unsupported extensions', () => {
            assert.ok(!lw.file.hasTeXExt('.cls'))
            assert.ok(!lw.file.hasTeXExt('.sty'))
            assert.ok(!lw.file.hasTeXExt('.txt'))
        })
    })

    describe('lw.file.hasBinaryExt', () => {
        it('should return true for non-TeX source extensions', () => {
            assert.ok(lw.file.hasBinaryExt('.pdf'))
            assert.ok(lw.file.hasBinaryExt('.png'))
            assert.ok(lw.file.hasBinaryExt('.txt'))
        })

        it('should return false for TeX source extensions', () => {
            assert.ok(!lw.file.hasBinaryExt('.tex'))
            assert.ok(!lw.file.hasBinaryExt('.cls'))
            assert.ok(!lw.file.hasBinaryExt('.rnw'))
            assert.ok(!lw.file.hasBinaryExt('.jnw'))
            assert.ok(!lw.file.hasBinaryExt('.pnw'))
        })
    })

    describe('lw.file.hasTeXLangId', () => {
        it('should return true for supported TeX languages', () => {
            assert.ok(lw.file.hasTeXLangId('tex'))
            assert.ok(lw.file.hasTeXLangId('latex'))
            assert.ok(lw.file.hasTeXLangId('latex-expl3'))
            assert.ok(lw.file.hasTeXLangId('doctex'))
            assert.ok(lw.file.hasTeXLangId('pweave'))
            assert.ok(lw.file.hasTeXLangId('jlweave'))
            assert.ok(lw.file.hasTeXLangId('rsweave'))
        })

        it('should return false for unsupported languages', () => {
            assert.ok(!lw.file.hasTeXLangId('markdown'))
            assert.ok(!lw.file.hasTeXLangId('python'))
            assert.ok(!lw.file.hasTeXLangId('html'))
        })
    })

    describe('lw.file.hasBibLangId', () => {
        it('should return true for BibTeX language', () => {
            assert.ok(lw.file.hasBibLangId('bibtex'))
        })

        it('should return false for non-BibTeX languages', () => {
            assert.ok(!lw.file.hasBibLangId('latex'))
            assert.ok(!lw.file.hasBibLangId('tex'))
            assert.ok(!lw.file.hasBibLangId('markdown'))
        })
    })

    describe('lw.file.hasDtxLangId', () => {
        it('should return true for Doctex language', () => {
            assert.ok(lw.file.hasDtxLangId('doctex'))
        })

        it('should return false for non-Doctex languages', () => {
            assert.ok(!lw.file.hasDtxLangId('latex'))
            assert.ok(!lw.file.hasDtxLangId('tex'))
            assert.ok(!lw.file.hasDtxLangId('markdown'))
        })
    })

    describe('lw.file.read', () => {
        it('should read the content of an existing file', () => {
            setRoot('01', 'main.tex')
            const content = lw.file.read(lw.root.file.path ?? '')
            assert.strictEqual(content, '\\documentclass{article}\n\\begin{document}\nabc\n\\end{document}\n')
        })

        it('should return undefined when file does not exist and raise is false', () => {
            setRoot('01', 'main.tex')
            const content = lw.file.read(lw.root.file.path?.replaceAll('main.tex', 'nonexistent.tex') ?? '', false)
            assert.strictEqual(content, undefined)
        })

        it('should throw error when file does not exist and raise is true', () => {
            setRoot('01', 'main.tex')
            try {
                lw.file.read(lw.root.file.path?.replaceAll('main.tex', 'nonexistent.tex') ?? '', true)
                assert.fail('Expected an error to be thrown')
            } catch (error: any) {
                assert.strictEqual(error.code, 'ENOENT')
            }
        })
    })

    describe('lw.file.exists', () => {
        it('should return true for an existing file URI', async () => {
            setRoot('01', 'main.tex')
            assert.ok(await lw.file.exists(vscode.Uri.file(lw.root.file.path ?? '')))
        })

        it('should return false for a non-existing file URI', async () => {
            setRoot('01', 'main.tex')
            assert.ok(!await lw.file.exists(vscode.Uri.file(lw.root.file.path?.replaceAll('main.tex', 'nonexistent.tex') ?? '')))
        })

        it('should handle non-file URIs', async () => {
            const oldStat = lw.external.stat
            lw.external.stat = () => { return Promise.resolve({type: 0, ctime: 0, mtime: 0, size: 0}) }
            const result = await lw.file.exists(vscode.Uri.parse('https://code.visualstudio.com/'))
            lw.external.stat = oldStat
            assert.ok(result)
        })

        it('should handle non-existing non-file URIs', async () => {
            assert.ok(!await lw.file.exists(vscode.Uri.parse('untitled:/Untitled-1')))
        })
    })

    describe('kpsewhich', () => {
        it('should call kpsewhich with correct arguments', async () => {
            await setConfig('kpsewhich.path', 'kpse')
            const stub = sinon.stub(lw.external, 'sync').returns({ pid: 0, status: 0, stdout: '', output: [''], stderr: '', signal: 'SIGTERM' })
            lw.file.kpsewhich('article.cls')
            stub.restore()
            sinon.assert.calledWith(stub, 'kpse', ['article.cls'], sinon.match.any)
        })

        it('should handle isBib flag correctly', async () => {
            await setConfig('kpsewhich.path', 'kpse')
            const stub = sinon.stub(lw.external, 'sync').returns({ pid: 0, status: 0, stdout: '', output: [''], stderr: '', signal: 'SIGTERM' })
            lw.file.kpsewhich('reference.bib', true)
            stub.restore()
            sinon.assert.calledWith(stub, 'kpse', ['-format=.bib', 'reference.bib'], sinon.match.any)
        })

        it('should return undefined if kpsewhich returns non-zero status', () => {
            const stub = sinon.stub(lw.external, 'sync').returns({ pid: 0, status: 1, stdout: '', output: [''], stderr: '', signal: 'SIGTERM' })
            const result = lw.file.kpsewhich('article.cls')
            stub.restore()
            assert.strictEqual(result, undefined)
        })

        it('should cache resolved path and hit', () => {
            const stub = sinon.stub(lw.external, 'sync').returns({ pid: 0, status: 0, stdout: '/path/to/article.cls', output: [''], stderr: '', signal: 'SIGTERM' })
            const result1 = lw.file.kpsewhich('article.cls')
            const result2 = lw.file.kpsewhich('article.cls')
            stub.restore()
            assert.strictEqual(stub.callCount, 1)
            assert.strictEqual(result1, result2)
        })

        it('should not cache on non-zero return', () => {
            const stub = sinon.stub(lw.external, 'sync').returns({ pid: 0, status: 1, stdout: '/path/to/article.cls', output: [''], stderr: '', signal: 'SIGTERM' })
            lw.file.kpsewhich('another-article.cls')
            lw.file.kpsewhich('another-article.cls')
            stub.restore()
            assert.strictEqual(stub.callCount, 2)
        })

        it('should handle kpsewhich call failure gracefully', () => {
            const stub = sinon.stub(lw.external, 'sync').throws(new Error('kpsewhich failed'))
            const result = lw.file.kpsewhich('yet-another-article.cls')
            stub.restore()
            assert.strictEqual(result, undefined)
        })
    })
})
