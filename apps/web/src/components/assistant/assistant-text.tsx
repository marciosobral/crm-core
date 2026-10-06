import { Fragment, type ReactNode } from "react"

const boldPattern = /\*\*([^*\n]+)\*\*/g
const bulletPrefix = "- "

function renderInline(line: string): ReadonlyArray<ReactNode> {
  const parts: Array<ReactNode> = []
  let cursor = 0
  for (const match of line.matchAll(boldPattern)) {
    if (match.index > cursor) parts.push(line.slice(cursor, match.index))
    parts.push(<strong key={match.index}>{match[1]}</strong>)
    cursor = match.index + match[0].length
  }
  if (cursor < line.length) parts.push(line.slice(cursor))
  return parts
}

// Renders the only markdown the assistant is asked to write: **bold**, "- " bullet lines and line
// breaks. Anything else stays as literal text, and no HTML is ever interpreted.
export function AssistantText({ content }: { content: string }) {
  const blocks: Array<{ isList: boolean; lines: Array<string> }> = []
  for (const line of content.split("\n")) {
    const isBullet = line.startsWith(bulletPrefix)
    const text = isBullet ? line.slice(bulletPrefix.length) : line
    const last = blocks.at(-1)
    if (last && last.isList === isBullet) last.lines.push(text)
    else blocks.push({ isList: isBullet, lines: [text] })
  }
  return blocks.map((block, blockIndex) =>
    block.isList ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: blocks come from static text and never reorder
      <ul key={blockIndex} className="list-disc pl-5">
        {block.lines.map((line, lineIndex) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: lines never reorder
          <li key={lineIndex}>{renderInline(line)}</li>
        ))}
      </ul>
    ) : (
      // biome-ignore lint/suspicious/noArrayIndexKey: blocks come from static text and never reorder
      <p key={blockIndex}>
        {block.lines.map((line, lineIndex) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: lines never reorder
          <Fragment key={lineIndex}>
            {lineIndex > 0 && <br />}
            {renderInline(line)}
          </Fragment>
        ))}
      </p>
    ),
  )
}
