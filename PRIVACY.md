# Privacy Policy

## Data Collection

Motrix AI does not collect any personal data. All data stays on your local machine.

## AI Processing

When using AI features:

- **OpenCode (Free)**: Your queries are sent to OpenCode's servers for processing. No data is stored.
- **Anthropic/OpenAI**: If you configure your own API key, queries are sent to the respective provider. See their privacy policies.
- **Ollama (Local)**: All processing happens locally. No data leaves your machine.

## Download Activity

Download history is stored locally in SQLite database at `~/.motrix-ai/tasks.db`. This data never leaves your device unless you explicitly configure NAS archive sync.

## Configuration

Your settings are stored locally at `~/.motrix-ai/config.json`. API keys are stored securely in your system keychain.

## Third-Party Services

- **aria2**: Open-source download engine, runs locally
- **Search Providers**: Queries are sent to public search APIs (btdig, mikan, DuckDuckGo)
- **Subtitle Sources**: Queries are sent to subtitle APIs (shooter.cn, subhd.tv)

## Updates

Motrix AI checks for updates via GitHub Releases. No personal data is sent during update checks.

## Contact

For privacy concerns, please open an issue on GitHub.
