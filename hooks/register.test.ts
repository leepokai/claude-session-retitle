import { expect, test } from 'claude-code/testing'

const usage = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
const answered = (text: string) => ({ value: { isAnswered: true, text, usage } })

const engine = (on: any, reply: unknown, seen: { prompt?: string; calls: number } = { calls: 0 }) => {
  on('classic.UserPromptSubmit', () => ({}))
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
  const seen = engine(on, answered('TITLE: 修登入 bug'))
  const result = await $.classic.UserPromptSubmit({ prompt: '幫我修登入', source: 'user' })

  expect(result.sessionTitle).toBe('修登入 bug')
  expect(seen.prompt).toContain('<current_title>(none)</current_title>')
  expect(seen.prompt).toContain('assistant: found the cause')
  expect(seen.prompt).not.toContain('secret context')
})

test('a title the work has drifted from is replaced', async ($, on) => {
  engine(on, answered('The work moved on.\n\nTITLE: Migrate billing DB'))
  const result = await $.classic.UserPromptSubmit({ prompt: 'now the billing migration', source: 'user', session_title: 'Fix login bug' })

  expect(result.sessionTitle).toBe('Migrate billing DB')
})

test('KEEP, a repeat, a rambling reply and a failed call all leave the title alone', async ($, on) => {
  let model: unknown
  on('classic.UserPromptSubmit', () => ({}))
  on('session.messages', () => ({ value: [] }))
  on('model.complete', () => model)

  for (const reply of [answered('KEEP'), answered('keep.'), answered('TITLE: Fix login bug'), answered('Sure!\nHere is a title'), answered('TITLE: ' + 'x'.repeat(61)), { value: { isAnswered: false, reason: 'api-error' } }]) {
    model = reply
    const result = await $.classic.UserPromptSubmit({ prompt: 'ok', source: 'user', session_title: 'Fix login bug' })

    expect(result.sessionTitle).toBeUndefined()
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
  on('session.messages', () => ({ value: [] }))
  on('model.complete', () => ({ deny: 'model not allowed' }))
  const result = await $.classic.UserPromptSubmit({ prompt: 'fix it', source: 'user' })

  expect(result.block).toBeUndefined()
  expect(result.sessionTitle).toBeUndefined()
  expect(beneath).toBe(1)
})
