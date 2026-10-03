# Claude Plan Pane

A Claude Code mod that shows Claude's plan in a side pane as it writes it in plan mode, with a comment button on every section so you can give feedback on one part without retyping it.

[![License](https://img.shields.io/github/license/ellenrchen/claude-plan-pane)](LICENSE)

## Install

Inside Claude Code, run:

```
/plugin marketplace add ellenrchen/claude-plan-pane
/plugin install plan-pane
/reload-plugins
```

That's it. Enter plan mode, and the pane opens as soon as Claude writes the plan.

<details>
<summary><strong>Prefer the terminal?</strong></summary>

```bash
claude plugin marketplace add ellenrchen/claude-plan-pane
claude plugin install plan-pane@claude-plan-pane
```

Then run `/reload-plugins` inside a session, or start a new one.

</details>

## What You See

```
╭─ Plan ─────────────────────────────────────╮
│ Document upload demo                 close │
│ Ship a working demo of document upload.    │
│                                            │
│ Context                            comment │
│ Why we need it, and what's out of scope.   │
│                                            │
│ Steps                              comment │
│   1. Add the upload endpoint               │
│   2. Wire the dropzone                     │
╰────────────────────────────────────────────╯
```

- **Opens on its own.** The pane opens the moment Claude writes or edits a plan. If your terminal is too narrow to fit it beside the session, a toast tells you to run `/plan-pane`.
- **Stays in sync.** Every edit Claude makes to the plan redraws the pane.
- **Comment on a section.** Press `comment` (or `1` to `9` while the pane has focus) to quote that section's heading into your prompt, then type your feedback under it.
- **Starts empty.** A new session shows nothing until Claude writes a plan, so you never see a stale plan from an earlier session.

Run `/plan-pane` at any time to bring the pane back after closing it.

## How It Works

Claude Code writes plans as Markdown files in `~/.claude/plans/`. Claude Plan Pane is a [mod](https://code.claude.com/docs/en/plugins/mods/overview):

1. It watches Claude's `Write` and `Edit` tool calls. When one succeeds on a file in `~/.claude/plans/`, it reads that file and keeps it in session state.
2. It splits the plan into sections at the `#` to `####` headings and draws them in a pane with Claude Code's `Markdown` element.
3. A section's `comment` button adds `> <heading>` to the end of your prompt.

## Security

Claude Plan Pane is local-only. It makes no network requests and writes no files. It only reads plan files that Claude itself just wrote in `~/.claude/plans/`.

Run `claude plugin validate` on the repo to see every event it hooks and every call it makes.

## Requirements

- Claude Code v2.1.287 or later (mods support)
- The pane docks beside the transcript in the fullscreen terminal; elsewhere it sits above the prompt

## Troubleshooting

**The pane never opens.** Run `/plugin` and check that `plan-pane` is listed as an active mod. If it isn't, run `/reload-plugins`.

**I see "No plan yet".** Claude hasn't written a plan in this session. The pane fills in as soon as it does.

## Development

```bash
git clone https://github.com/ellenrchen/claude-plan-pane
cd claude-plan-pane

# Load it for one session without installing
claude --plugin-dir .

# Check it and run the tests
claude plugin validate .
claude plugin test .
```

Claude Code writes the API types into `.claude-plugin/types/` the first time it loads the mod, and `tsc -p .` type-checks it from then on.

## License

MIT. See [LICENSE](LICENSE).
