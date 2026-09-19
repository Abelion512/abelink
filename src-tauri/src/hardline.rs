// Hardline detector — cermin Rust dari guardian sidecar
// (`sidecar/main/tools/_shared.mjs`: HARDLINE_PATTERNS).
//
// Tujuan (backlog OPERATING-ADOPTION #1): perintah hardline ditolak di
// Rust TANPA dialog approval — sebelumnya dialog muncul lalu handler
// sidecar yang menolak. Tanpa regex crate (match manual, tanpa dep baru).
//
// Cakupan: payload `native-tool:execute` untuk tool run-shell/run-bash/
// run-powershell dengan query string perintah. Tool lain -> None (bukan
// hardline, gate normal berlaku).

/// True bila perintah shell termasuk pola hardline (auto-deny).
pub(crate) fn is_hardline_shell(cmd: &str) -> bool {
    let c = cmd.trim();
    if c.is_empty() {
        return false;
    }
    // Quote-masking ala Hermes: teks dalam quote bukan perintah — KECUALI
    // shell carrier (sh|bash|eval|source -c '...') yang isinya memang kode.
    let is_carrier = is_shell_carrier(c);
    let scan: String;
    let s: &str = if is_carrier {
        c
    } else {
        scan = mask_quoted(c);
        &scan
    };
    let lower = s.to_lowercase();

    // rm -rf ke root/home/sistem (terminator termasuk quote penutup).
    if rm_rf_target(&lower) {
        return true;
    }
    // mkfs apa pun.
    if contains_word(&lower, "mkfs") {
        return true;
    }
    // dd ke block device.
    if lower.contains("dd ") && has_block_device_target(&lower) {
        return true;
    }
    if has_block_redirect(&lower) {
        return true;
    }
    // Fork bomb.
    if lower.contains(":(){") || lower.contains(": ()") {
        return true;
    }
    // Bunuh init / matikan mesin.
    if has_kill_init(&lower) || has_power_cmd(&lower) {
        return true;
    }
    false
}

/// Klasifikasi payload node_invoke: Some(alasan) bila hardline.
pub(crate) fn hardline_reason(action: &str, payload: &Option<serde_json::Value>) -> Option<String> {
    if action != "native-tool:execute" {
        return None;
    }
    let arr = payload.as_ref().and_then(|p| p.as_array())?;
    let tool = arr.first().and_then(|v| v.as_str()).unwrap_or("");
    if !matches!(tool, "run-shell" | "run-bash" | "run-powershell") {
        return None;
    }
    let query = arr.get(1).and_then(|v| v.as_str()).unwrap_or("");
    if is_hardline_shell(query) {
        return Some(
            "DITOLAK OTOMATIS (hardline): perintah merusak tanpa jalan pulih. Tidak bisa di-approve.".to_string(),
        );
    }
    None
}

fn is_shell_carrier(c: &str) -> bool {
    let l = c.to_lowercase();
    for prefix in ["sh ", "bash ", "zsh ", "dash ", "eval ", "source "] {
        if l.starts_with(prefix) || l.contains(&format!("\n{prefix}")) {
            return true;
        }
    }
    // sh -c '...' / bash -c "..."
    l.contains("-c '") || l.contains("-c \"")
}

fn mask_quoted(c: &str) -> String {
    // Hapus isi '...' dan "..." (sederhana, cukup untuk klasifikasi).
    let mut out = String::with_capacity(c.len());
    let mut chars = c.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == '\'' || ch == '"' {
            let q = ch;
            out.push(q);
            out.push(q);
            for inner in chars.by_ref() {
                if inner == q {
                    break;
                }
            }
        } else {
            out.push(ch);
        }
    }
    out
}

fn contains_word(hay: &str, word: &str) -> bool {
    // Batas kata sederhana: kemunculan yang tidak diapit alfanumerik.
    let mut start = 0;
    while let Some(idx) = hay[start..].find(word) {
        let i = start + idx;
        let before = hay[..i].chars().last();
        let after = hay[i + word.len()..].chars().next();
        let boundary = |ch: Option<char>| ch.map(|c| !c.is_alphanumeric()).unwrap_or(true);
        if boundary(before) && boundary(after) {
            return true;
        }
        start = i + 1;
    }
    false
}

fn rm_rf_target(lower: &str) -> bool {
    // Cari 'rm' + flag mengandung r dan f, lalu target sistem/home/root.
    let mut search = lower;
    loop {
        let Some(rm_idx) = search.find("rm ") else {
            return false;
        };
        let after = &search[rm_idx + 3..];
        // Flag: deretan '-' + huruf segera setelah 'rm '.
        let mut flag_end = 0;
        let mut has_r = false;
        let mut has_f = false;
        for ch in after.chars() {
            if flag_end == 0 && ch == '-' {
                flag_end += 1;
                continue;
            }
            if flag_end > 0 && ch.is_ascii_alphabetic() {
                if ch == 'r' || ch == 'R' {
                    has_r = true;
                }
                if ch == 'f' || ch == 'F' {
                    has_f = true;
                }
                flag_end += 1;
                continue;
            }
            break;
        }
        if has_r && has_f {
            let rest = &after[flag_end..];
            // Target: / /home /root /etc /usr /var /bin /sbin /boot /lib ~ $HOME
            // atau rm -rf tanpa target (dangling = tolak juga).
            let t = rest.trim_start_matches([' ', '\t', '\'', '"']);
            if t.is_empty()
                || t.starts_with('/')
                || t.starts_with('~')
                || t.starts_with("$HOME")
                || t.starts_with("$home")
            {
                return true;
            }
        }
        search = after;
        if search.len() < 4 {
            return false;
        }
        search = &search[1..];
    }
}

fn has_block_device_target(lower: &str) -> bool {
    // of=/dev/sdX|nvme|hd|mmcblk|vd|xvd
    let Some(of_idx) = lower.find("of=") else {
        return false;
    };
    let rest = &lower[of_idx + 3..];
    let dev = rest.trim_start_matches([' ', '\t', '\'', '"']);
    dev.starts_with("/dev/sd")
        || dev.starts_with("/dev/nvme")
        || dev.starts_with("/dev/hd")
        || dev.starts_with("/dev/mmcblk")
        || dev.starts_with("/dev/vd")
        || dev.starts_with("/dev/xvd")
}

fn has_block_redirect(lower: &str) -> bool {
    // > /dev/sdX (redirect tulis ke block device).
    let mut search = lower;
    loop {
        let Some(gt) = search.find('>') else {
            return false;
        };
        let rest = search[gt + 1..].trim_start_matches([' ', '\t', '\'', '"', '>']);
        if rest.starts_with("/dev/sd")
            || rest.starts_with("/dev/nvme")
            || rest.starts_with("/dev/hd")
            || rest.starts_with("/dev/mmcblk")
            || rest.starts_with("/dev/vd")
            || rest.starts_with("/dev/xvd")
        {
            return true;
        }
        search = &search[gt + 1..];
        if search.is_empty() {
            return false;
        }
    }
}

fn has_kill_init(lower: &str) -> bool {
    // kill [-9] 1 (tepat, bukan 10/100).
    let mut search = lower;
    loop {
        let Some(k) = search.find("kill") else {
            return false;
        };
        let rest = search[k + 4..].trim_start();
        let rest = rest.strip_prefix("-9").unwrap_or(rest).trim_start();
        if rest == "1" || rest.starts_with("1 ") || rest.starts_with("1\t") || rest.starts_with("1;") {
            return true;
        }
        search = &search[k + 4..];
        if search.len() < 5 {
            return false;
        }
        search = &search[1..];
    }
}

fn has_power_cmd(lower: &str) -> bool {
    for w in [
        "shutdown",
        "reboot",
        "poweroff",
        "halt",
        "telinit",
        "kexec",
    ] {
        if contains_word(lower, w) {
            return true;
        }
    }
    if lower.contains("systemctl") {
        for sub in ["poweroff", "reboot", "halt", "kexec"] {
            if lower.contains(sub) {
                return true;
            }
        }
    }
    // init 0 / init 6
    if let Some(idx) = lower.find("init ") {
        let rest = lower[idx + 5..].trim_start();
        if rest.starts_with('0') || rest.starts_with('6') {
            return true;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hardline_rm_targets() {
        assert!(is_hardline_shell("rm -rf /"));
        assert!(is_hardline_shell("rm -rf /home/abelion"));
        assert!(is_hardline_shell("sudo rm -rf ~"));
        assert!(is_hardline_shell("rm -rf"));
        assert!(is_hardline_shell("bash -c 'rm -rf /'"));
        assert!(!is_hardline_shell("rm -rf ./tmp/x"));
        assert!(!is_hardline_shell("rm file.txt"));
        assert!(!is_hardline_shell("echo \"rm -rf /\""));
    }

    #[test]
    fn hardline_destructive_devices() {
        assert!(is_hardline_shell("mkfs.ext4 /dev/sda1"));
        assert!(is_hardline_shell("dd if=/dev/zero of=/dev/sda"));
        assert!(is_hardline_shell("cat data > /dev/sda"));
        assert!(is_hardline_shell(":(){ :|:& };:"));
        assert!(is_hardline_shell("kill -9 1"));
        assert!(is_hardline_shell("shutdown now"));
        assert!(is_hardline_shell("systemctl reboot"));
        assert!(!is_hardline_shell("kill 1234"));
        assert!(!is_hardline_shell("dd if=/dev/zero of=out.bin"));
    }

    #[test]
    fn hardline_reason_gates_payload() {
        let mk = |tool: &str, q: &str| {
            Some(serde_json::json!([tool, q]))
        };
        assert!(hardline_reason("native-tool:execute", &mk("run-shell", "rm -rf /")).is_some());
        assert!(hardline_reason("native-tool:execute", &mk("run-bash", "mkfs.ext4 /dev/sda1")).is_some());
        assert!(hardline_reason("native-tool:execute", &mk("run-shell", "ls -la")).is_none());
        assert!(hardline_reason("native-tool:execute", &mk("read-file", "rm -rf /")).is_none());
        assert!(hardline_reason("other-action", &mk("run-shell", "rm -rf /")).is_none());
    }

    #[test]
    fn quote_masking_holds() {
        assert!(!is_hardline_shell("echo \"mkfs\""));
        assert!(!is_hardline_shell("grep 'rm -rf' log.txt"));
        assert!(!is_hardline_shell("sh -c \"chmod 777 x\"")); // chmod bukan hardline
        assert!(is_hardline_shell("sh -c \"rm -rf /\""));
    }
}
