// Title Case normalizer for the split name fields (Nombres / Apellidos) in the
// on-ramp + off-ramp forms. First letter of every word uppercase, everything
// else lowercase. Words are separated by whitespace, hyphens, or apostrophes
// so compound Colombian names like `Maria-Jose` and `d'Angelo` keep their
// separators intact and each part gets capitalized.
//
// Applied on every keystroke so the user sees the formatted result live,
// matching the "may inicial y minuscula" UX the product asked for. Uses
// Unicode letter class so tildes / diereses / eñe are handled correctly
// (Jose -> Jose, Nunez -> Nunez, Maria -> Maria).
export function toTitleCase(input: string): string {
  return input
    .toLowerCase()
    .replace(
      /(^|[\s\-'])(\p{L})/gu,
      (_match, sep: string, letter: string) => sep + letter.toUpperCase()
    )
}
