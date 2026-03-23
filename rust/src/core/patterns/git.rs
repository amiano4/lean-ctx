use regex::Regex;
use std::sync::OnceLock;

static STATUS_BRANCH_RE: OnceLock<Regex> = OnceLock::new();
static AHEAD_RE: OnceLock<Regex> = OnceLock::new();

fn status_branch_re() -> &'static Regex {
    STATUS_BRANCH_RE.get_or_init(|| Regex::new(r"On branch (\S+)").unwrap())
}
fn ahead_re() -> &'static Regex {
    AHEAD_RE.get_or_init(|| Regex::new(r"ahead of .+ by (\d+) commit").unwrap())
}

pub fn compress(command: &str, output: &str) -> Option<String> {
    if command.contains("status") {
        return Some(compress_status(output));
    }
    if command.contains("log") {
        return Some(compress_log(output));
    }
    if command.contains("diff") {
        return Some(compress_diff(output));
    }
    None
}

fn compress_status(output: &str) -> String {
    let mut branch = String::from("?");
    let mut ahead = 0u32;
    let mut staged = Vec::new();
    let mut unstaged = Vec::new();
    let mut untracked = Vec::new();

    let mut section = "";

    for line in output.lines() {
        if let Some(caps) = status_branch_re().captures(line) {
            branch = caps[1].to_string();
        }
        if let Some(caps) = ahead_re().captures(line) {
            ahead = caps[1].parse().unwrap_or(0);
        }

        if line.contains("Changes to be committed") {
            section = "staged";
        } else if line.contains("Changes not staged") {
            section = "unstaged";
        } else if line.contains("Untracked files") {
            section = "untracked";
        }

        let trimmed = line.trim();
        if trimmed.starts_with("new file:") {
            let file = trimmed.trim_start_matches("new file:").trim();
            if section == "staged" {
                staged.push(format!("+{file}"));
            }
        } else if trimmed.starts_with("modified:") {
            let file = trimmed.trim_start_matches("modified:").trim();
            match section {
                "staged" => staged.push(format!("~{file}")),
                "unstaged" => unstaged.push(format!("~{file}")),
                _ => {}
            }
        } else if trimmed.starts_with("deleted:") {
            let file = trimmed.trim_start_matches("deleted:").trim();
            if section == "staged" {
                staged.push(format!("-{file}"));
            }
        } else if section == "untracked"
            && !trimmed.is_empty()
            && !trimmed.starts_with('(')
            && !trimmed.starts_with("Untracked")
        {
            untracked.push(trimmed.to_string());
        }
    }

    let mut parts = Vec::new();
    let ahead_str = if ahead > 0 {
        format!(" ↑{ahead}")
    } else {
        String::new()
    };
    parts.push(format!("{branch}{ahead_str}"));

    if !staged.is_empty() {
        parts.push(format!("staged: {}", staged.join(" ")));
    }
    if !unstaged.is_empty() {
        parts.push(format!("unstaged: {}", unstaged.join(" ")));
    }
    if !untracked.is_empty() {
        parts.push(format!("untracked: {}", untracked.join(" ")));
    }

    parts.join("\n")
}

fn compress_log(output: &str) -> String {
    let lines: Vec<&str> = output.lines().collect();
    if lines.is_empty() {
        return String::new();
    }

    let is_oneline = !lines[0].starts_with("commit ");
    if is_oneline {
        return lines.join("\n");
    }

    let mut entries = Vec::new();
    for line in &lines {
        let trimmed = line.trim();
        if trimmed.starts_with("commit ") {
            let hash = &trimmed[7..14.min(trimmed.len())];
            entries.push(format!("{hash}"));
        } else if !trimmed.is_empty()
            && !trimmed.starts_with("Author:")
            && !trimmed.starts_with("Date:")
            && !trimmed.starts_with("Merge:")
        {
            if let Some(last) = entries.last_mut() {
                *last = format!("{last} {trimmed}");
            }
        }
    }

    if entries.is_empty() {
        return output.to_string();
    }

    entries.join("\n")
}

fn compress_diff(output: &str) -> String {
    let mut files = Vec::new();
    let mut current_file = String::new();
    let mut additions = 0;
    let mut deletions = 0;

    for line in output.lines() {
        if line.starts_with("diff --git") {
            if !current_file.is_empty() {
                files.push(format!("{current_file} +{additions}/-{deletions}"));
            }
            current_file = line
                .split(" b/")
                .nth(1)
                .unwrap_or("?")
                .to_string();
            additions = 0;
            deletions = 0;
        } else if line.starts_with('+') && !line.starts_with("+++") {
            additions += 1;
        } else if line.starts_with('-') && !line.starts_with("---") {
            deletions += 1;
        }
    }
    if !current_file.is_empty() {
        files.push(format!("{current_file} +{additions}/-{deletions}"));
    }

    files.join("\n")
}
