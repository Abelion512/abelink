import { describe, it, expect } from 'vitest'
import path from 'node:path'
import {
  evaluateHeadlessSecurity,
  validateHeadlessShellCommand,
  validateHeadlessPath,
  HEADLESS_BLOCKED_TOOLS,
  HEADLESS_INTERACTIVE_TOOLS,
  ALLOWED_SHELL_BINARIES
} from '../src/api/ai/headlessSecurity.js'

describe('headlessSecurity - fail-closed security preflight', () => {
  const workspaceRoot = '/tmp/abelink-test-workspace'

  describe('Interactive tools fail closed', () => {
    it.each([
      'ask-user',
      'user-ask',
      'browser-ask',
      'browser-ask-user',
      'os-ask',
      'os-ask-user',
      'ask-choice',
      'user-choice'
    ])('blocks interactive tool "%s" with unavailable-in-headless-mode', (tool) => {
      const res = evaluateHeadlessSecurity(tool, 'bantu saya login', { workspaceRoot })
      expect(res.allowed).toBe(false)
      expect(res.code).toBe('unavailable-in-headless-mode')
      expect(res.category).toBe('interactive-capability')
      expect(res.message).toMatch(/mode headless/)
    })
  })

  describe('Gated destructive / mutation actions fail closed', () => {
    it.each([
      'git-commit',
      'git-revert',
      'delete-file',
      'run-task',
      'task-kill',
      'delegate_coding',
      'skills:save',
      'skills:delete',
      'plugin:create',
      'plugin:delete',
      'plugin:execute',
      'plugin:install-git',
      'tg:start',
      'tg:stop',
      'google:connect',
      'google:disconnect',
      'capabilities:authorize',
      'capabilities:revoke',
      'os-click',
      'os-type',
      'os-key',
      'os-scroll',
      'os-open',
      'os-double-click'
    ])('blocks destructive / gated tool "%s" with unavailable-in-headless-mode', (tool) => {
      const res = evaluateHeadlessSecurity(tool, 'payload-query', { workspaceRoot })
      expect(res.allowed).toBe(false)
      expect(res.code).toBe('unavailable-in-headless-mode')
      expect(['approval-required', 'containment']).toContain(res.category)
    })
  })

  describe('Shell execution whitelist & carrier prevention', () => {
    it('blocks hardline destructive commands with policy-denied', () => {
      const hardlines = [
        'rm -rf /',
        'rm -rf ~',
        'mkfs.ext4 /dev/sda1',
        'dd if=/dev/zero of=/dev/sda',
        ':(){ :|:& };:'
      ]
      for (const cmd of hardlines) {
        const res = validateHeadlessShellCommand(cmd)
        expect(res.allowed).toBe(false)
        expect(res.code).toBe('policy-denied')
        expect(res.category).toBe('hardline')
      }
    })

    it('blocks dangerous write commands or sensitive mutations', () => {
      const dangerous = [
        'rm -rf node_modules',
        'chmod -R 777 .',
        'cat id_rsa > ~/.ssh/authorized_keys'
      ]
      for (const cmd of dangerous) {
        const res = validateHeadlessShellCommand(cmd)
        expect(res.allowed).toBe(false)
        expect(res.code).toBe('unavailable-in-headless-mode')
      }
    })

    it('blocks pipelines, redirects, command substitutions, and carriers', () => {
      const carriers = [
        'ls | grep test',
        'echo hello > out.txt',
        'cat < input.txt',
        'ls & pwd',
        'ls; pwd',
        'echo `whoami`',
        'echo $(whoami)',
        'bash -c "rm -rf ."',
        'sh -c "cat /etc/passwd"',
        'python3 -c "import os; os.system(\'ls\')"',
        'curl http://example.com',
        'wget http://example.com'
      ]
      for (const cmd of carriers) {
        const res = validateHeadlessShellCommand(cmd)
        expect(res.allowed).toBe(false)
        expect(res.code).toBe('unavailable-in-headless-mode')
      }
    })

    it('blocks unlisted binaries', () => {
      const unlisted = [
        'nc -l 8080',
        'nmap localhost',
        'gcc main.c',
        'make',
        'docker run alpine'
      ]
      for (const cmd of unlisted) {
        const res = validateHeadlessShellCommand(cmd)
        expect(res.allowed).toBe(false)
        expect(res.code).toBe('unavailable-in-headless-mode')
        expect(res.message).toMatch(/tidak terdaftar dalam whitelist/)
      }
    })

    it('allows read-only git commands', () => {
      expect(validateHeadlessShellCommand('git status').allowed).toBe(true)
      expect(validateHeadlessShellCommand('git diff HEAD~1').allowed).toBe(true)
      expect(validateHeadlessShellCommand('git log -n 5').allowed).toBe(true)
      expect(validateHeadlessShellCommand('git branch -a').allowed).toBe(true)
    })

    it('blocks mutating git commands via shell', () => {
      expect(validateHeadlessShellCommand('git push origin main').allowed).toBe(false)
      expect(validateHeadlessShellCommand('git commit -m "msg"').allowed).toBe(false)
      expect(validateHeadlessShellCommand('git reset --hard').allowed).toBe(false)
      expect(validateHeadlessShellCommand('git clean -fd').allowed).toBe(false)
    })

    it('allows safe runtimes only for version or help checks', () => {
      expect(validateHeadlessShellCommand('node -v').allowed).toBe(true)
      expect(validateHeadlessShellCommand('bun --version').allowed).toBe(true)
      expect(validateHeadlessShellCommand('cargo -V').allowed).toBe(true)
      expect(validateHeadlessShellCommand('node script.js').allowed).toBe(false)
      expect(validateHeadlessShellCommand('bun run something').allowed).toBe(false)
    })

    it('allows whitelisted read-only utilities with safe arguments', () => {
      expect(validateHeadlessShellCommand('ls -la src/').allowed).toBe(true)
      expect(validateHeadlessShellCommand('pwd').allowed).toBe(true)
      expect(validateHeadlessShellCommand('head -n 20 README.md').allowed).toBe(true)
      expect(validateHeadlessShellCommand('cat package.json').allowed).toBe(true)
    })
  })

  describe('Filesystem containment and sensitive target protection', () => {
    it('blocks empty path', () => {
      const res = validateHeadlessPath('', workspaceRoot)
      expect(res.allowed).toBe(false)
      expect(res.code).toBe('tool-error')
    })

    it('blocks sensitive target files (.env, .ssh, .bashrc, etc.)', () => {
      const sensitivePaths = [
        '.env',
        'config/.env.local',
        '/home/user/.ssh/id_rsa',
        '~/.bashrc',
        '/etc/passwd'
      ]
      for (const p of sensitivePaths) {
        const res = validateHeadlessPath(p, workspaceRoot)
        expect(res.allowed).toBe(false)
        expect(res.code).toBe('unavailable-in-headless-mode')
        expect(['approval-required', 'containment']).toContain(res.category)
      }
    })

    it('blocks path traversal escaping workspaceRoot', () => {
      const escapes = [
        '../outside.txt',
        'sub/../../secret.txt',
        '/media/abelion/Isaf/ican/project/abelink-apple/secret.txt'
      ]
      for (const p of escapes) {
        const res = validateHeadlessPath(p, workspaceRoot)
        expect(res.allowed).toBe(false)
        expect(res.code).toBe('unavailable-in-headless-mode')
        expect(res.category).toBe('containment')
      }
    })

    it('allows safe relative paths contained within workspaceRoot', () => {
      expect(validateHeadlessPath('src/file.txt', workspaceRoot).allowed).toBe(true)
      expect(validateHeadlessPath('file.txt', workspaceRoot).allowed).toBe(true)
      expect(validateHeadlessPath(path.join(workspaceRoot, 'doc.md'), workspaceRoot).allowed).toBe(true)
    })

    it('evaluates write-file, replace-content, and replace-lines paths through evaluateHeadlessSecurity', () => {
      const blockedWrite = evaluateHeadlessSecurity(
        'write-file',
        '../outside.txt||konten',
        { workspaceRoot }
      )
      expect(blockedWrite.allowed).toBe(false)
      expect(blockedWrite.code).toBe('unavailable-in-headless-mode')

      const allowedWrite = evaluateHeadlessSecurity(
        'write-file',
        'src/valid.txt||konten baru',
        { workspaceRoot }
      )
      expect(allowedWrite.allowed).toBe(true)
    })
  })
})
