import { formatCurrencyText } from '../utils/currency';
import './AssistantMessage.css';

const INLINE_MARKDOWN = /(\*\*[^*]+\*\*|`[^`]+`|₱\s*-?\d[\d,]*(?:\.\d+)?|PHP\s*-?\d[\d,]*(?:\.\d+)?|\*[^*\n]+\*)/g;
const headingLine = (line) => line.match(/^#{1,4}\s+(.+)$/);
const listLine = (line) => line.match(/^\s*([-*•]|\d+[.)])\s+(.+)$/);

const renderInline = (value, keyPrefix) => formatCurrencyText(value).split(INLINE_MARKDOWN).map((part, index) => {
  const key = `${keyPrefix}-${index}`;
  if (part.startsWith('**') && part.endsWith('**')) return <strong key={key}>{part.slice(2, -2)}</strong>;
  if (part.startsWith('`') && part.endsWith('`')) return <code key={key}>{part.slice(1, -1)}</code>;
  if (/^(?:₱|PHP)\s*-?\d/i.test(part)) return <span className="assistant-markdown-price" key={key}>{part}</span>;
  if (part.startsWith('*') && part.endsWith('*')) return <em key={key}>{part.slice(1, -1)}</em>;
  return part;
});

export default function AssistantMessage({ text = '' }) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) { index += 1; continue; }

    if (line.startsWith('```')) {
      const codeLines = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push(<pre className="assistant-markdown-code" key={`block-${blocks.length}`}><code>{codeLines.join('\n')}</code></pre>);
      continue;
    }

    const heading = headingLine(line);
    if (heading) {
      blocks.push(<h3 className="assistant-markdown-heading" key={`block-${blocks.length}`}>{renderInline(heading[1], `heading-${index}`)}</h3>);
      index += 1;
      continue;
    }

    if (/^(?:---+|___+|\*\*\*+)$/.test(line)) {
      blocks.push(<hr className="assistant-markdown-rule" key={`block-${blocks.length}`} />);
      index += 1;
      continue;
    }

    const firstListItem = listLine(lines[index]);
    if (firstListItem) {
      const ordered = /^\d/.test(firstListItem[1]);
      const items = [];
      while (index < lines.length) {
        const current = listLine(lines[index]);
        if (current && /^\d/.test(current[1]) === ordered) {
          items.push({ label: current[2], details: [] });
          index += 1;
          continue;
        }
        if (items.length && /^\s{2,}\S/.test(lines[index])) {
          items.at(-1).details.push(lines[index].trim());
          index += 1;
          continue;
        }
        break;
      }
      const List = ordered ? 'ol' : 'ul';
      blocks.push(
        <List className="assistant-markdown-list" key={`block-${blocks.length}`}>
          {items.map((item, itemIndex) => (
            <li key={`item-${itemIndex}`}>
              <span className="assistant-markdown-list-label">{renderInline(item.label, `item-${blocks.length}-${itemIndex}`)}</span>
              {item.details.map((detail, detailIndex) => <span className="assistant-markdown-detail" key={`detail-${detailIndex}`}>{renderInline(detail, `detail-${blocks.length}-${itemIndex}-${detailIndex}`)}</span>)}
            </li>
          ))}
        </List>,
      );
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote = [];
      while (index < lines.length && /^\s*>/.test(lines[index])) {
        quote.push(lines[index].replace(/^\s*>\s?/, '').trim());
        index += 1;
      }
      blocks.push(<blockquote className="assistant-markdown-quote" key={`block-${blocks.length}`}>{renderInline(quote.join(' '), `quote-${index}`)}</blockquote>);
      continue;
    }

    const paragraph = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !headingLine(lines[index].trim()) && !listLine(lines[index]) && !lines[index].trim().startsWith('```')) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
      const isEstimateCallout = /^\*\*Estimated range:\*\*/i.test(paragraph[0]);
      const paragraphClass = `assistant-markdown-paragraph${isEstimateCallout ? ' assistant-markdown-callout' : ''}`;
      blocks.push(<p className={paragraphClass} key={`block-${blocks.length}`}>{renderInline(paragraph.join(' '), `paragraph-${index}`)}</p>);
  }

  return <div className="assistant-rich-text">{blocks}</div>;
}
