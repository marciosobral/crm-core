export const escapeLikePattern = (text: string) => text.replace(/[\\%_]/g, "\\$&")
