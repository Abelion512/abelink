import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'
import util from 'util'

const execPromise = util.promisify(exec)

// Helper: Cek apakah command PowerShell berbahaya
const DANGEROUS_KEYWORDS = [
  'Remove-Item', 'rm ', 'del ', 'rmdir', 
  'Format-', 'Clear-Disk', 
  'Stop-Process', 'kill ', 'taskkill', 
  'Set-ExecutionPolicy', 
  'Restart-Computer', 'shutdown', 
  'reg delete'
]
export const isDangerousCommand = (cmd) => DANGEROUS_KEYWORDS.some(k => cmd.toLowerCase().includes(k.toLowerCase()))

export const NATIVE_TOOLS = {
  'read-file': {
    needsApproval: false,
    handler: async (query) => {
      try {
        const parts = query.split('||');
        const filePath = parts[0].trim();
        if (!fs.existsSync(filePath)) return { success: false, message: 'File tidak ditemukan di path tersebut.' };
        
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        const totalLines = lines.length;
        
        if (parts.length >= 3) {
          const startLine = parseInt(parts[1].trim(), 10);
          const endLine = parseInt(parts[2].trim(), 10);
          
          if (!isNaN(startLine) && !isNaN(endLine)) {
            const sliceLines = lines.slice(Math.max(0, startLine - 1), Math.min(totalLines, endLine));
            const sliceContent = sliceLines.map((l, i) => `[${startLine + i}] ${l}`).join('\n');
            return { success: true, totalLines, showing: `Baris ${startLine} - ${endLine}`, content: sliceContent };
          }
        }

        // Default potong 400 baris awal
        const defaultLines = lines.slice(0, 400);
        const defaultContent = defaultLines.map((l, i) => `[${i + 1}] ${l}`).join('\n');
        return { 
          success: true, 
          totalLines,
          content: defaultContent,
          note: totalLines > 400 ? 'File panjang. Hanya menampilkan 400 baris awal. Gunakan read-file dengan argumen startLine||endLine untuk melihat sisa baris.' : ''
        }; 
      } catch (e) {
        return { success: false, error: e.message };
      }
    }
  },
  'write-file': {
    needsApproval: true,
    approvalMessage: (query) => `Mark ingin menulis/membuat file:\n${query.split('||')[0].trim()}`,
    handler: async (query) => {
      try {
        const parts = query.split('||');
        if (parts.length < 2) return { success: false, message: "Format salah. Gunakan separator '||' (contoh: D:\\file.txt||Halo)" };
        
        const filePath = parts[0].trim();
        const content = parts.slice(1).join('||');
        
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        
        fs.writeFileSync(filePath, content, 'utf8');
        return { success: true, message: `Berhasil menyimpan file ke ${filePath}` };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }
  },
  'replace-lines': {
    needsApproval: true,
    approvalMessage: (query) => {
      const parts = query.split('||');
      return `Mark ingin mengganti baris ${parts[1]} hingga ${parts[2]} di file:\n${parts[0].trim()}`;
    },
    handler: async (query) => {
      try {
        const parts = query.split('||');
        if (parts.length < 4) return { success: false, message: "Format salah. Gunakan: path||startLine||endLine||kode_baru" };
        
        const filePath = parts[0].trim();
        const startLine = parseInt(parts[1].trim(), 10);
        const endLine = parseInt(parts[2].trim(), 10);
        const newContent = parts.slice(3).join('||');
        
        if (!fs.existsSync(filePath)) return { success: false, message: 'File tidak ditemukan.' };
        
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        
        if (startLine < 1 || startLine > lines.length || endLine < startLine) {
           return { success: false, message: 'Range baris tidak valid' };
        }
        
        lines.splice(startLine - 1, (endLine - startLine) + 1, newContent);
        
        fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
        return { success: true, message: `Berhasil mengganti baris ${startLine}-${endLine} di ${filePath}` };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }
  },
  'delete-file': {
    needsApproval: true,
    approvalMessage: (query) => `Mark ingin MENGHAPUS file secara permanen:\n${query}`,
    handler: async (query) => {
      try {
        if (!fs.existsSync(query)) return { success: false, message: 'File tidak ditemukan.' };
        fs.unlinkSync(query);
        return { success: true, message: `Berhasil menghapus file ${query}` };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }
  },
  'list-dir': {
    needsApproval: false,
    handler: async (query) => {
      try {
        if (!fs.existsSync(query)) return { success: false, message: 'Folder tidak ditemukan.' };
        const files = fs.readdirSync(query);
        return { success: true, total_files: files.length, contents: files.join('\n') };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }
  },
  'grep-search': {
    needsApproval: false,
    handler: async (query) => {
      try {
        const parts = query.split('||');
        if (parts.length < 2) return { success: false, message: "Format salah. Gunakan separator '||' (contoh: D:\\Project||nama_fungsi)" };
        
        const dirPath = parts[0].trim();
        const keyword = parts[1].trim();
        
        const cmd = `findstr /S /I /N /C:"${keyword}" "${dirPath}\\*.*"`;
        const { stdout } = await execPromise(cmd);
        
        const result = stdout.split('\n').slice(0, 50).join('\n');
        return { success: true, result: result || 'Pencarian tidak menemukan hasil apapun.' };
      } catch (e) {
        return { success: true, result: 'Pencarian tidak menemukan hasil apapun (atau folder kosong).' };
      }
    }
  },
  'run-powershell': {
    needsApproval: (query) => isDangerousCommand(query),
    approvalMessage: (query) => `Mark ingin mengeksekusi perintah PowerShell yang berpotensi BERBAHAYA:\n\n${query}`,
    handler: async (query) => {
      if (!query) return { success: false, message: "Tidak ada perintah yang diberikan." };
      try {
        const { stdout, stderr } = await execPromise(`powershell.exe -Command "${query}"`);
        return { 
          success: true, 
          output: stdout.trim() || "Perintah berhasil dieksekusi tanpa output teks.", 
          error: stderr.trim() || null 
        };
      } catch (error) {
        return { 
          success: false, 
          message: "Gagal mengeksekusi perintah.", 
          error: error.message 
        };
      }
    }
  }
}
