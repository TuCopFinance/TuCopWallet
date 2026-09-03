import { toTitleCase } from 'src/tucopramp/nameFormat'

describe('toTitleCase', () => {
  it('capitalizes the first letter of each word', () => {
    expect(toTitleCase('juan pablo')).toBe('Juan Pablo')
  })

  it('lowercases the rest of each word', () => {
    expect(toTitleCase('JUAN PABLO')).toBe('Juan Pablo')
    expect(toTitleCase('jUaN pAbLo')).toBe('Juan Pablo')
  })

  it('preserves single spaces between words as typed', () => {
    expect(toTitleCase('juan   pablo')).toBe('Juan   Pablo')
  })

  it('handles compound names separated by hyphens', () => {
    expect(toTitleCase('maria-jose')).toBe('Maria-Jose')
  })

  it('handles apostrophes as word separators', () => {
    expect(toTitleCase("d'angelo")).toBe("D'Angelo")
  })

  it('handles Spanish diacritics correctly', () => {
    expect(toTitleCase('josé núñez')).toBe('José Núñez')
    expect(toTitleCase('MARÍA')).toBe('María')
  })

  it('is empty-safe', () => {
    expect(toTitleCase('')).toBe('')
    expect(toTitleCase('   ')).toBe('   ')
  })

  it('capitalizes even after a leading space', () => {
    expect(toTitleCase(' juan')).toBe(' Juan')
  })
})
