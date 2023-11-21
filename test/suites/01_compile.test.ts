import * as vscode from 'vscode'
import * as path from 'path'
import * as cs from 'cross-spawn'
import * as sinon from 'sinon'
import * as assert from 'assert'
import { lw } from '../../src/lw'

describe('The compile module', () => {
    before(async () => {
        await vscode.commands.executeCommand('latex-workshop.activate')
    })

    afterEach(async () => {
        sinon.restore()

        await vscode.workspace.getConfiguration('latex-workshop').update('latex.tools', undefined)
        await vscode.workspace.getConfiguration('latex-workshop').update('latex.outDir', undefined)
        await vscode.workspace.getConfiguration('latex-workshop').update('latex.recipes', undefined)
        await vscode.workspace.getConfiguration('latex-workshop').update('latex.build.forceRecipeUsage', undefined)
        await vscode.workspace.getConfiguration('latex-workshop').update('latex.rootFile.doNotPrompt', undefined)
        await vscode.workspace.getConfiguration('latex-workshop').update('latex.rootFile.useSubFile', undefined)
        await vscode.workspace.getConfiguration('latex-workshop').update('latex.search.rootFiles.include', undefined)
        await vscode.workspace.getConfiguration('latex-workshop').update('latex.search.rootFiles.exclude', undefined)
    })

    it('can compile', async () => {
        await vscode.workspace.getConfiguration('latex-workshop')
            .update('latex.tools', [{name: 'latexmk', command: 'true', args: ['-pdf', '%DOC%']}])
        const { context, spawn } = setStub({ rootFilePath: 'base/main.tex' })

        await lw.commands.build()

        const args = spawn.getCall(0).args
        assert.ok(args[0], 'true')
        assert.ok(args[1][0], '-pdf')
        assert.ok(args[1][1], context.rootFilePath.replaceAll('.tex', ''))
        assert.ok(args[2].cwd, path.dirname(context.rootFilePath))
    })

    it('can compile with space in file names', async () => {
        await vscode.workspace.getConfiguration('latex-workshop')
            .update('latex.tools', [{name: 'latexmk', command: 'true', args: ['-pdf', '%DOC%']}])
        const { context, spawn } = setStub({ rootFilePath: 'base/main.tex' })

        await lw.commands.build()

        const args = spawn.getCall(0).args
        assert.ok(args[1][0], context.rootFilePath.replaceAll('.tex', ''))
        assert.ok(args[1][1], context.rootFilePath.replaceAll('.tex', ''))
        assert.ok(args[1][2], context.rootFilePath.replaceAll('.tex', ''))
    })

    it('can compile with repeating tool placeholders', async () => {
        await vscode.workspace.getConfiguration('latex-workshop')
            .update('latex.tools', [{name: 'latexmk', command: 'true', args: ['-pdf', '%DOC%', '%DOC%', '%DOC%']}])
        const { context, spawn } = setStub({ rootFilePath: 'base/main.tex' })

        await lw.commands.build()

        const args = spawn.getCall(0).args
        assert.ok(args[1][1], context.rootFilePath.replaceAll('.tex', ''))
        assert.ok(args[1][2], context.rootFilePath.replaceAll('.tex', ''))
        assert.ok(args[1][3], context.rootFilePath.replaceAll('.tex', ''))
    })

    it('can compile the sub-file if `latex.rootFile.useSubFile` is set to `true`', async () => {
        await vscode.workspace.getConfiguration('latex-workshop')
            .update('latex.tools', [{name: 'latexmk', command: 'true', args: ['-pdf', '%DOC%']}])
        await vscode.workspace.getConfiguration('latex-workshop').update('latex.rootFile.doNotPrompt', true)
        await vscode.workspace.getConfiguration('latex-workshop').update('latex.rootFile.useSubFile', true)
        const { context, spawn } = setStub({ rootFilePath: 'subfile/main.tex', subFilePath: 'subfile/sub/s.tex' })

        await lw.commands.build()

        const args = spawn.getCall(0).args
        assert.ok(args[1][1], context.subFilePath?.replaceAll('.tex', ''))
    })

    it('can compile the main file if `latex.rootFile.useSubFile` is set to `false`, regardless of sub-files', async () => {
        await vscode.workspace.getConfiguration('latex-workshop')
            .update('latex.tools', [{name: 'latexmk', command: 'true', args: ['-pdf', '%DOC%']}])
        await vscode.workspace.getConfiguration('latex-workshop').update('latex.rootFile.doNotPrompt', true)
        await vscode.workspace.getConfiguration('latex-workshop').update('latex.rootFile.useSubFile', false)
        const { context, spawn } = setStub({ rootFilePath: 'subfile/main.tex', subFilePath: 'subfile/sub/s.tex' })

        await lw.commands.build()

        const args = spawn.getCall(0).args
        assert.ok(args[1][1], context.rootFilePath.replaceAll('.tex', ''))
    })
})

function setStub(context: {
        rootFilePath: string,
        subFilePath?: string,
        rootFileLang?: string,
        subFileLang?: string}) {
    context.rootFilePath = path.resolve(
        vscode.workspace.workspaceFile?.fsPath ?? vscode.workspace.workspaceFolders?.[0].uri.fsPath ?? '',
        './01_compile',
        context.rootFilePath)
    if (context.subFilePath !== undefined) {
        context.subFilePath = path.resolve(
            vscode.workspace.workspaceFile?.fsPath ?? vscode.workspace.workspaceFolders?.[0].uri.fsPath ?? '',
            './01_compile',
            context.subFilePath)
    }
    context.rootFileLang = context.rootFileLang ?? 'latex'
    context.subFileLang = context.subFileLang ?? 'latex'

    sinon.stub(vscode.window, 'activeTextEditor').value({
        document: {
            fileName: context.rootFilePath,
            languageId: 'latex',
            uri: vscode.Uri.file(context.rootFilePath)
        }
    })
    sinon.stub(lw.root.file, 'path').value(context.rootFilePath)
    sinon.stub(lw.root.file, 'langId').value(context.rootFileLang)
    sinon.stub(lw.root.subfiles, 'path').value(context.subFilePath)
    sinon.stub(lw.root.subfiles, 'langId').value(context.subFilePath ? context.subFileLang : undefined)
    sinon.stub(lw.root.dir, 'path').value(path.dirname(context.rootFilePath))
    sinon.stub(lw.root, 'find').returns(Promise.resolve(undefined))
    sinon.stub(lw.root, 'getWorkspace').returns(undefined)
    const spawn = sinon.spy()
    sinon.stub(lw, 'spawnProc').callsFake((_command, _args, _options) => {
        spawn(_command, _args, _options)
        return cs.spawn(_command, _args, _options)
    })
    return {
        context,
        spawn
    }
}
