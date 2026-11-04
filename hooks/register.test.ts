import { expect, test } from 'claude-code/testing'

const usage = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
const answered = (text: string) => ({ value: { isAnswered: true, text, usage } })
const revParse = (stdout: string, exitCode = 0) => ({ value: { exitCode, stdout, stderr: '' } })
const MAIN_TREE = '/repo/.git\n/repo/.git\n/repo\nmain\n'

const engine = (on: any, reply: unknown, git: unknown = revParse(MAIN_TREE)) => {
  const seen: { prompt?: string; calls: number } = { calls: 0 }

  on('classic.UserPromptSubmit', () => ({}))
  on('process.run', () => git)
  on('session.messages', () => ({
    value: [
      { role: 'user', content: [{ type: 'text', text: '<system-reminder>secret context</system-reminder>' }, { type: 'text', text: 'fix the login bug' }] },
      { role: 'assistant', content: [{ type: 'tool_use', name: 'Read' }, { type: 'text', text: 'found the cause' }] },
    ],
  }))
  on('model.complete', (_: unknown, ask: { prompt: string }) => {
    seen.calls++
    seen.prompt = ask.prompt
    return reply
  })
  return seen
}

test('an unnamed session gets named from the prompt and the recent text', async ($, on) => {
  const seen = engine(on, answered('TITLE: fix-login-bug'))
  const result = await $.classic.UserPromptSubmit({ prompt: '幫我修登入', source: 'user' })

  expect(result.sessionTitle).toBe('fix-login-bug')
  expect(seen.prompt).toContain('<current_title>(none)</current_title>')
  expect(seen.prompt).toContain('assistant: found the cause')
  expect(seen.prompt).not.toContain('secret context')
})

test('a title the work has drifted from is replaced', async ($, on) => {
  const seen = engine(on, answered('The work moved on.\n\nTITLE: migrate-billing-db'))
  const result = await $.classic.UserPromptSubmit({ prompt: 'now the billing migration', source: 'user', session_title: 'fix-login-bug' })

  expect(result.sessionTitle).toBe('migrate-billing-db')
  expect(seen.prompt).toContain('<current_title>fix-login-bug</current_title>')
})

test('a reply is put into kebab-case', async ($, on) => {
  engine(on, answered('TITLE: "Upgrade Next.js_16 on feat/app"'))
  const result = await $.classic.UserPromptSubmit({ prompt: 'upgrade', source: 'user' })

  expect(result.sessionTitle).toBe('upgrade-next-js-16-on-feat-app')
})

test('a current title in another format counts as no title', async ($, on) => {
  const seen = engine(on, answered('TITLE: fix-login-bug'))
  const result = await $.classic.UserPromptSubmit({ prompt: 'ok', source: 'user', session_title: '修正登入 bug' })

  expect(result.sessionTitle).toBe('fix-login-bug')
  expect(seen.prompt).toContain('<current_title>(none)</current_title>')
})

test('KEEP, a repeat, a rambling reply, a non-kebab reply and a failed call all leave the title alone', async ($, on) => {
  let model: unknown
  on('classic.UserPromptSubmit', () => ({}))
  on('process.run', () => revParse(MAIN_TREE))
  on('session.messages', () => ({ value: [] }))
  on('model.complete', () => model)

  for (const reply of [answered('KEEP'), answered('keep.'), answered('TITLE: fix-login-bug'), answered('Sure!\nHere is a title'), answered('TITLE: 修登入'), answered('TITLE: ' + 'x'.repeat(61)), { value: { isAnswered: false, reason: 'api-error' } }]) {
    model = reply
    const result = await $.classic.UserPromptSubmit({ prompt: 'ok', source: 'user', session_title: 'fix-login-bug' })

    expect(result.sessionTitle).toBeUndefined()
  }
})

test('a linked worktree and its branch reach the model', async ($, on) => {
  const seen = engine(on, answered('TITLE: auth-refactor'), revParse('/repo/.git/worktrees/auth-refactor\n/repo/.git\n/repo/.claude/worktrees/auth-refactor\nfeat/auth-refactor\n'))
  await $.classic.UserPromptSubmit({ prompt: 'hi', source: 'user' })

  expect(seen.prompt).toContain('worktree: auth-refactor')
  expect(seen.prompt).toContain('branch: feat/auth-refactor')
})

test('a feature branch outside a worktree reaches the model', async ($, on) => {
  const seen = engine(on, answered('KEEP'), revParse('/repo/.git\n/repo/.git\n/repo\nfeat/billing\n'))
  await $.classic.UserPromptSubmit({ prompt: 'hi', source: 'user' })

  expect(seen.prompt).toContain('branch: feat/billing')
  expect(seen.prompt).not.toContain('worktree:')
})

test('the main tree on a trunk branch sends no workspace', async ($, on) => {
  const seen = engine(on, answered('KEEP'))
  await $.classic.UserPromptSubmit({ prompt: 'hi', source: 'user' })

  expect(seen.prompt).not.toContain('<workspace>')
})

test('no repository and no git still name the session', async ($, on) => {
  let git: unknown = revParse('', 128)
  let seenPrompt = ''
  on('classic.UserPromptSubmit', () => ({}))
  on('process.run', () => git)
  on('session.messages', () => ({ value: [] }))
  on('model.complete', (_: unknown, ask: { prompt: string }) => {
    seenPrompt = ask.prompt
    return answered('TITLE: fix-login-bug')
  })

  for (const failure of [revParse('', 128), { deny: 'git not found' }]) {
    git = failure
    const result = await $.classic.UserPromptSubmit({ prompt: 'fix login', source: 'user' })

    expect(result.sessionTitle).toBe('fix-login-bug')
    expect(seenPrompt).not.toContain('<workspace>')
  }
})

test('prompts nobody typed cost no model call', async ($, on) => {
  const seen = engine(on, answered('TITLE: nope'))

  for (const source of ['sdk', 'system', 'loop_wakeup', 'schedule_wakeup'] as const) {
    expect((await $.classic.UserPromptSubmit({ prompt: 'run', source })).sessionTitle).toBeUndefined()
  }
  expect(seen.calls).toBe(0)
})

test('a prompt a hook beneath blocked costs no model call', async ($, on) => {
  let calls = 0
  on('classic.UserPromptSubmit', () => ({ block: 'no' }))
  on('model.complete', () => {
    calls++
    return answered('TITLE: nope')
  })
  const result = await $.classic.UserPromptSubmit({ prompt: 'run', source: 'user' })

  expect(result.sessionTitle).toBeUndefined()
  expect(calls).toBe(0)
})

test('a refused model call leaves the prompt and the title alone', async ($, on) => {
  let beneath = 0
  on('classic.UserPromptSubmit', () => {
    beneath++
    return {}
  })
  on('process.run', () => revParse(MAIN_TREE))
  on('session.messages', () => ({ value: [] }))
  on('model.complete', () => ({ deny: 'model not allowed' }))
  const result = await $.classic.UserPromptSubmit({ prompt: 'fix it', source: 'user' })

  expect(result.block).toBeUndefined()
  expect(result.sessionTitle).toBeUndefined()
  expect(beneath).toBe(1)
})
