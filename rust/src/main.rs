use anyhow::Result;
use rmcp::ServiceExt;
use tracing_subscriber::EnvFilter;

mod core;
mod server;
mod shell;
mod tools;

#[tokio::main]
async fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().collect();

    if args.len() > 1 {
        match args[1].as_str() {
            "-c" => {
                let command = args[2..].join(" ");
                let code = shell::exec(&command);
                std::process::exit(code);
            }
            "exec" => {
                let command = args[2..].join(" ");
                let code = shell::exec(&command);
                std::process::exit(code);
            }
            "shell" | "--shell" => {
                shell::interactive();
                return Ok(());
            }
            "--version" | "-V" => {
                println!("lean-ctx 1.0.0");
                return Ok(());
            }
            "--help" | "-h" => {
                print_help();
                return Ok(());
            }
            _ => {
                eprintln!("lean-ctx: unknown argument '{}'\n", args[1]);
                print_help();
                std::process::exit(1);
            }
        }
    }

    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .with_writer(std::io::stderr)
        .init();

    tracing::info!("lean-ctx v1.0.0 MCP server starting");

    let server = tools::create_server();
    let transport = rmcp::transport::io::stdio();
    let service = server.serve(transport).await?;
    service.waiting().await?;

    Ok(())
}

fn print_help() {
    println!(
        "lean-ctx 1.0.0 — Smart Context MCP Server + Shell Hook

USAGE:
    lean-ctx                  Start MCP server (stdio transport)
    lean-ctx -c \"command\"     Execute command with compressed output (shell hook)
    lean-ctx exec \"command\"   Same as -c
    lean-ctx shell            Interactive shell with output compression
    lean-ctx --version        Show version

MODES:
    MCP Server (default)      Native integration with Cursor, Copilot, Claude Code
    Shell Hook (-c)           Transparent output compression, works as SHELL replacement
    Interactive Shell          REPL with automatic output compression

EXAMPLES:
    # As MCP server (in mcp.json):
    {{\"command\": \"lean-ctx\"}}

    # As shell hook (in Cursor settings):
    \"terminal.integrated.profiles.osx\": {{
        \"lean-ctx\": {{\"path\": \"/path/to/lean-ctx\", \"args\": [\"--shell\"]}}
    }}

    # Direct use:
    lean-ctx -c \"git status\"
    lean-ctx -c \"cargo build 2>&1\"
    lean-ctx exec \"npm install\"
"
    );
}
