/**
 * Minimal Markdown -> HTML for the bundled legal documents.
 *
 * Supports only what those files use: # headings, paragraphs, "- " lists,
 * "> " blockquotes, "---" rules, **bold**, _italic_ and `code`. All text is
 * HTML-escaped before formatting is applied, so raw HTML in the source is
 * shown as text rather than rendered.
 */

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inline(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])_([^_]+)_(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
}

export function renderMarkdown(source) {
  const out = [];
  let paragraph = [];
  let list = [];
  let quote = [];

  const flush = () => {
    if (paragraph.length) out.push(`<p>${inline(paragraph.join(' '))}</p>`);
    if (list.length) out.push(`<ul>${list.map((li) => `<li>${inline(li)}</li>`).join('')}</ul>`);
    if (quote.length) out.push(`<blockquote><p>${inline(quote.join(' '))}</p></blockquote>`);
    paragraph = [];
    list = [];
    quote = [];
  };

  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    let match;

    if (!line) {
      flush();
    } else if ((match = line.match(/^(#{1,6})\s+(.*)$/))) {
      flush();
      const level = match[1].length;
      out.push(`<h${level}>${inline(match[2])}</h${level}>`);
    } else if (/^-{3,}$/.test(line)) {
      flush();
      out.push('<hr />');
    } else if ((match = line.match(/^>\s?(.*)$/))) {
      if (paragraph.length || list.length) flush();
      quote.push(match[1]);
    } else if ((match = line.match(/^[-*]\s+(.*)$/))) {
      if (paragraph.length || quote.length) flush();
      list.push(match[1]);
    } else {
      if (list.length || quote.length) flush();
      paragraph.push(line);
    }
  }
  flush();

  return out.join('\n');
}
