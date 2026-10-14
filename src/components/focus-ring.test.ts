import { describe, expect, test } from 'bun:test'
import { Glob } from 'bun'

const root = new URL('../', import.meta.url).pathname

/** Every quoted class string in a source file that removes the outline. */
async function outlineless(): Promise<{ file: string; classes: string }[]> {
  const found: { file: string; classes: string }[] = []
  for await (const path of new Glob('**/*.tsx').scan(root)) {
    if (path.includes('.test.')) {
      continue
    }
    const source = await Bun.file(`${root}${path}`).text()
    for (const match of source.matchAll(/(['"`])((?:(?!\1).)*outline-none(?:(?!\1).)*)\1/g)) {
      found.push({ file: path, classes: match[2] ?? '' })
    }
  }
  return found
}

describe('focus indicators', () => {
  test('a control that drops the outline draws a full-colour ring (3:1 needs more than ring-ring/50)', async () => {
    const weak = (await outlineless()).filter(
      ({ classes }) =>
        /(?:focus(?:-visible)?:)(?:after:)?ring-ring\/\d+/.test(classes) &&
        !classes.includes('focus-visible:border-ring')
    )
    expect(weak).toEqual([])
  })
})
