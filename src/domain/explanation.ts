export const maxStepLength = 2048;
const valuePrefixLength = 120;

function prefix(text: string, length: number) {
  const end = text.charCodeAt(length - 1);
  return text.slice(0, end >= 0xd800 && end <= 0xdbff ? length - 1 : length);
}

export function clip(text: string, limit: number) {
  if (text.length <= limit) return text;
  return limit === 0 ? "" : prefix(text, limit - 1) + "…";
}

export class BoundedText {
  readonly limit: number;
  text = "";
  truncated = false;

  constructor(limit: number) {
    this.limit = limit;
  }

  append(part: string, separator = "") {
    if (this.truncated) return;
    const next = this.text + separator + part.slice(0, this.limit + 1);
    this.truncated = next.length > this.limit;
    this.text = clip(next, this.limit);
  }
}

export function display(value: string | number | boolean | (string | number)[]) {
  if (Array.isArray(value)) {
    const list = new BoundedText(valuePrefixLength);
    list.append("[");
    for (const [index, entry] of value.entries()) {
      list.append(String(entry), index === 0 ? "" : ", ");
      if (list.truncated) break;
    }
    list.append("]");
    return list.truncated ? `${list.text} (${value.length} items)` : list.text;
  }
  const text = String(value);
  return text.length <= valuePrefixLength
    ? text
    : `${prefix(text, valuePrefixLength)}… (${text.length} UTF-16 code units)`;
}
