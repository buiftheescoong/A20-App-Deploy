export function cleanMarkdown(markdown: string): string {
  let cleaned = markdown.replace(/\r\n?/g, '\n').trim();
  const leadingFence = /^```\w*\s*\n/;
  const trailingFence = /\n```\s*$/;

  if (leadingFence.test(cleaned) && trailingFence.test(cleaned)) {
    cleaned = cleaned.replace(leadingFence, '').replace(trailingFence, '');
  }

  return cleaned
    .replace(/[ \t]*<br\s*\/?>[ \t]*/gi, '  \n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
