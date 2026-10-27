import { describe, expect, test } from 'bun:test'
import { render } from '@testing-library/react'
import { Highlight, searchTerms } from '~/screens/search/highlight'

describe('marking a search\x27s words in its results', () => {
  test('the terms are the longer, uncommon words of the turns, lower-cased and once each', () => {
    expect(searchTerms(['The PRICE is too high', 'What about the price?'])).toEqual([
      'price',
      'high',
    ])
  })

  test('a word is marked where a word starts, never inside another word', () => {
    const { container } = render(
      <Highlight text='Prices rose; the caprice of pricing.' terms={['price']} />
    )
    expect([...container.querySelectorAll('mark')].map((mark) => mark.textContent)).toEqual([
      'Price',
    ])
    expect(container.textContent).toBe('Prices rose; the caprice of pricing.')
  })

  test('result text stays text: markup in it is never parsed, and regex characters are literal', () => {
    const { container } = render(
      <Highlight text='<img src=x onerror=alert(1)> costs (a+b)' terms={['a+b', 'img']} />
    )
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toBe('<img src=x onerror=alert(1)> costs (a+b)')
    expect([...container.querySelectorAll('mark')].map((mark) => mark.textContent)).toEqual([
      'img',
      'a+b',
    ])
  })

  test('with no terms the text is unchanged and nothing is marked', () => {
    const { container } = render(<Highlight text='Budget is fixed.' terms={[]} />)
    expect(container.querySelector('mark')).toBeNull()
    expect(container.textContent).toBe('Budget is fixed.')
  })
})
