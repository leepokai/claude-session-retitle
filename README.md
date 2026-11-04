# session-retitle

Keeps a Claude Code session's title on the task it is actually working on, so you never have to type `/rename`.

On every prompt you send, Haiku compares the prompt and the recent conversation with the current title:

| The session | What happens |
|---|---|
| has no title | It gets one right away, unless neither the message nor a worktree or branch name points to a task |
| is still on the same goal | The title stays, including for "ok", follow-ups, fixes and tests |
| has moved to a different goal or deliverable | It gets a new title |

Titles are lowercase English kebab-case, like `fix-stripe-webhook-retry`, whatever language you write in. In a linked worktree or on a feature branch, the title can reuse that name: saying "hi" on `feat/auth-refactor` names the session `auth-refactor`.

The title updates live in the prompt bar, the terminal tab and `/resume`.

## Install

At the prompt of a terminal session:

```
/plugin install session-retitle --marketplace leepokai/claude-session-retitle
```

Answer `y` to add the marketplace, then choose a scope. From a shell:

```sh
claude plugin install session-retitle --marketplace leepokai/claude-session-retitle
```

To remove it, run `claude plugin uninstall session-retitle`.

## How it works

The plugin is one `UserPromptSubmit` hook that returns `sessionTitle`, the same effect as `/rename`. It calls Haiku inside the running session through `$.model.complete`, so it starts no `claude -p` process and loads none of your other hooks or `CLAUDE.md` files. It reads the worktree and branch with `git rev-parse`.

## Good to know

- **Waiting:** Claude starts after the title call returns. In testing that took 0.8 to 5.9 seconds. After 8 seconds the title stays as it is and your prompt continues.
- **Usage:** Each typed prompt makes one Haiku call, which counts toward your plan or API bill.
- **What is sent:** Your latest prompt (up to 2,000 characters), the current title, the worktree and branch names, and the last 6 messages with text (up to 800 characters each).
- **Names you set yourself:** A kebab-case `/rename` title stays until the work moves on, then it is replaced. A title in any other format counts as no title and is replaced on your next prompt.
- **Skipped prompts:** `claude -p` runs, scheduled wakeups, task notifications and blocked prompts make no title call.
- **When titles change:** Only when you send a prompt. Claude Code has no way for a hook to rename a session in the middle of a turn.
- **Where titles appear:** Tested in a terminal on Claude Code 2.1.318. Other users report that hook titles don't reach [Remote Control](https://github.com/anthropics/claude-code/issues/104473) or the [VS Code panel](https://github.com/anthropics/claude-code/issues/104687).
- **Compatibility:** The hooks module API is early access and can change between Claude Code releases.

## Develop

```sh
claude --plugin-dir .     # run a session with the plugin loaded
claude plugin test .      # run the tests
claude plugin validate .  # check the manifest and module
```

## License

MIT
