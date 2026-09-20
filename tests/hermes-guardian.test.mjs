// Guardian 3-tier ala Hermes (approval_detection.py): hardline auto-deny,
// dangerous approval, self-dir protection, quote-masking.
import { describe, it, expect } from 'vitest'
import {
  isHardlineCommand,
  isDangerousCommand,
  classifyCommand,
  DANGEROUS_KEYWORDS
} from '../sidecar/main/tools/_shared.mjs'

describe('hardline (auto-deny, tanpa approval)', () => {
  it('rm -rf ke root/home/sistem', () => {
    expect(isHardlineCommand('rm -rf /')).toBe(true)
    expect(isHardlineCommand('rm -rf /home/abelion')).toBe(true)
    expect(isHardlineCommand('rm -rf ~')).toBe(true)
    expect(isHardlineCommand('sudo rm -rf /etc')).toBe(true)
    expect(classifyCommand('rm -rf /')).toBe('hardline')
  })

  it('mkfs, dd ke block device, redirect block', () => {
    expect(isHardlineCommand('mkfs.ext4 /dev/sda1')).toBe(true)
    expect(isHardlineCommand('dd if=/dev/zero of=/dev/sda')).toBe(true)
    expect(isHardlineCommand('cat data > /dev/sda')).toBe(true)
  })

  it('fork bomb, kill init, matikan mesin', () => {
    expect(isHardlineCommand(':(){ :|:& };:')).toBe(true)
    expect(isHardlineCommand('kill -9 1')).toBe(true)
    expect(isHardlineCommand('shutdown now')).toBe(true)
    expect(isHardlineCommand('systemctl reboot')).toBe(true)
  })
})

describe('dangerous (butuh approval, kompatibel lama)', () => {
  it('keyword lama tetap terdeteksi', () => {
    for (const k of ['rm -rf ./tmp/x', 'rmdir /tmp/x', 'kill 1234', 'fdisk -l', 'chmod 777 file', 'chown me file']) {
      expect(isDangerousCommand(k)).toBe(true)
    }
  })

  it('perintah aman lolos', () => {
    for (const c of ['ls -la', 'echo halo', 'git status', 'bunx vitest run', 'cat README.md']) {
      expect(classifyCommand(c)).toBe('safe')
      expect(isDangerousCommand(c)).toBe(false)
    }
  })
})

describe('quote-masking (ala Hermes)', () => {
  it('teks dalam quote BUKAN perintah', () => {
    expect(isHardlineCommand('echo "rm -rf /"')).toBe(false)
    expect(isDangerousCommand("grep 'rm -rf' log.txt")).toBe(false)
    expect(classifyCommand('echo "mkfs"')).toBe('safe')
  })

  it('shell carrier dipindai mentah', () => {
    expect(isHardlineCommand(`bash -c 'rm -rf /'`)).toBe(true)
    expect(isDangerousCommand(`sh -c "chmod 777 x"`)).toBe(true)
  })
})

describe('self-dir & sensitive-write protection (ala Hermes)', () => {
  it('rm -rf ke home/diri sendiri = hardline (tanpa jalan pulih)', () => {
    // ~ cocok pola home-wipe: benar hardline, bukan sekadar dangerous.
    expect(classifyCommand('rm -rf ~/.local/share/abelink/skills/lama')).toBe('hardline')
    expect(classifyCommand('rm -rf ~/Documents/Abelink Skills/x')).toBe('hardline')
  })

  it('rm biasa ke direktori sendiri butuh approval (dangerous)', () => {
    expect(isDangerousCommand('rm ~/.local/share/abelink-dev/browser-bridge-token')).toBe(true)
    expect(classifyCommand('rm ~/.local/share/abelink-dev/browser-bridge-token')).toBe('dangerous')
  })

  it('baca biasa di direktori sendiri tetap aman', () => {
    expect(classifyCommand('ls ~/.local/share/abelink/')).toBe('safe')
    expect(classifyCommand('cat ~/Documents/catatan.txt')).toBe('safe')
  })

  it('mutasi file ~/.ssh butuh approval (dangerous)', () => {
    expect(isDangerousCommand('echo "ssh-ed25519 AAA..." >> ~/.ssh/authorized_keys')).toBe(true)
    expect(classifyCommand('echo "key" >> ~/.ssh/authorized_keys')).toBe('dangerous')
    expect(isDangerousCommand('cp id_rsa ~/.ssh/id_rsa')).toBe(true)
    expect(isDangerousCommand('chmod 600 ~/.ssh/id_ed25519')).toBe(true)
    expect(isDangerousCommand('rm ~/.ssh/known_hosts')).toBe(true)
  })

  it('mutasi file .env butuh approval (dangerous)', () => {
    expect(isDangerousCommand('echo "API_KEY=123" > .env')).toBe(true)
    expect(isDangerousCommand('echo "KEY=x" > .env.local')).toBe(true)
    expect(isDangerousCommand('rm .env')).toBe(true)
    expect(isDangerousCommand('mv .env.production .env')).toBe(true)
    expect(classifyCommand('echo "FOO=bar" > .env')).toBe('dangerous')
  })

  it('mutasi shell rc files butuh approval (dangerous)', () => {
    expect(isDangerousCommand('sed -i "s/alias/alias2/" ~/.bashrc')).toBe(true)
    expect(isDangerousCommand('echo "export PATH=/bad:$PATH" >> ~/.zshrc')).toBe(true)
    expect(isDangerousCommand('cp evil.sh ~/.profile')).toBe(true)
    expect(classifyCommand('sed -i "s/a/b/" ~/.bashrc')).toBe('dangerous')
  })

  it('mutasi kredensial dan file sistem sensitif butuh approval (dangerous)', () => {
    expect(isDangerousCommand('echo "password" > ~/.netrc')).toBe(true)
    expect(isDangerousCommand('rm ~/.npmrc')).toBe(true)
    expect(isDangerousCommand('echo "bad ALL=(ALL) ALL" >> /etc/sudoers')).toBe(true)
    expect(isDangerousCommand('echo "hacked" > /etc/passwd')).toBe(true)
  })

  it('baca file sensitif tetap safe (read-only)', () => {
    expect(classifyCommand('cat .env')).toBe('safe')
    expect(classifyCommand('ls -la ~/.ssh')).toBe('safe')
    expect(classifyCommand('grep -i secret .env')).toBe('safe')
    expect(classifyCommand('head ~/.bashrc')).toBe('safe')
    expect(classifyCommand('cat ~/.profile')).toBe('safe')
  })
})

describe('run-shell handler auto-deny hardline', () => {
  it('handler menolak hardline tanpa eksekusi', async () => {
    const { shellTools } = await import('../sidecar/main/tools/shellTools.mjs')
    const r = await shellTools['run-shell'].handler('rm -rf /', {})
    expect(r.success).toBe(false)
    expect(r.message).toMatch(/HARDLINE|hardline/i)
  })
})

