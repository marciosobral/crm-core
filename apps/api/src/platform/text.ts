export const nullIfBlank = (text: string | undefined) =>
  text === undefined || text.trim() === "" ? null : text
