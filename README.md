# Claude Plan Pane

A Claude Code mod that shows Claude's plan in a side pane as it writes it in plan mode, and lets you approve it right there. The plan stays on the right, your conversation stays on the left, and the full-width "Ready to code?" dialog never takes over the screen.


[![License](https://img.shields.io/github/license/ellenrchen/claude-plan-pane)](LICENSE)

<img width="1411" height="845" alt="image" src="https://github.com/user-attachments/assets/f824435b-1edd-4e26-80ea-21a7456996cc" />

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
│ ready to execute                           │
│                                            │
│ [Approve and execute]  [Request changes]   │
│                                            │
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
- **Approve from the pane.** When Claude finishes planning, the pane shows **Approve and execute** (`a`) and **Request changes** (`r`) instead of opening the full-screen approval dialog. Approving sends "Approved" and Claude leaves plan mode and starts working. Typing feedback in the prompt works too: Claude stays in plan mode and revises.
- **Comment on a section.** Press `comment` (or `1` to `9` while the pane has focus) to quote that section's heading into your prompt, then type your feedback under it.
- **Starts empty.** A new session shows nothing until Claude writes a plan, so you never see a stale plan from an earlier session.

Run `/plan-pane` at any time to bring the pane back after closing it.

## Layout: Prompt on the Left, Plan on the Right

The pane docks beside the conversation only in Claude Code's fullscreen layout. Elsewhere it sits above the prompt instead. To get the conversation and prompt on the left with the plan on the right:

1. Turn on the fullscreen layout by adding this to `~/.claude/settings.json`, then start a new session:

   ```json
   { "tui": "fullscreen" }
   ```

2. Make your terminal at least 110 columns wide; 144 or more lets the pane open on its own the moment a plan is written. Below that, run `/plan-pane` to open it.
3. Enter plan mode (shift+tab) and ask Claude for a plan. Keep typing in the prompt on the left: feedback, questions, or a `comment` quote from the pane. When the plan is ready, approve it from the pane on the right.

## How It Works

Claude Code writes plans as Markdown files in `~/.claude/plans/`. Claude Plan Pane is a [mod](https://code.claude.com/docs/en/plugins/mods/overview):

1. It watches Claude's `Write` and `Edit` tool calls. When one succeeds on a file in `~/.claude/plans/`, it reads that file and keeps it in session state.
2. It splits the plan into sections at the `#` to `####` headings and draws them in a pane with Claude Code's `Markdown` element.
3. A section's `comment` button adds `> <heading>` to the end of your prompt.
4. When Claude calls `ExitPlanMode`, the mod holds the call back and tells Claude to wait for you, so the approval dialog doesn't open. Pressing **Approve** marks the plan approved and sends a prompt; Claude calls `ExitPlanMode` again, and the mod lets that call through, so Claude leaves plan mode as usual.

Approval applies only to the reviewed revision and is consumed after one exit attempt. Starting a new planning cycle or changing the plan requires another review. Other tools keep their normal permission checks.

If the pane can't be shown (for example, the terminal is too narrow to place it), the mod steps aside and Claude Code's own approval dialog appears as normal. The dialog's extra choices, like switching to bypass permissions, aren't offered in the pane; pick a mode with shift+tab after approving if you need one.

## Security

Claude Plan Pane is local-only. It makes no network requests and writes no files. It only reads plan files that Claude itself just wrote in `~/.claude/plans/`. It never approves a plan on its own: `ExitPlanMode` only goes through after you press **Approve** in the pane.

Run `claude plugin validate` on the repo to see every event it hooks and every call it makes.

## Requirements

- Claude Code v2.1.287 or later (mods support)
- The fullscreen layout and a terminal at least 110 columns wide, for the side-by-side view (see [Layout](#layout-prompt-on-the-left-plan-on-the-right))

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
