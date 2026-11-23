const glyphs: Readonly<Record<string, string>> = {
  "0": "o",
  "1": "l",
  а: "a",
  е: "e",
  о: "o",
  р: "p",
  с: "c",
  х: "x",
  і: "i",
};
const confusables = /rn|[01аеорсхі]/gu;

function skeleton(value: string): string {
  return value
    .normalize("NFKC")
    .replace(confusables, (part) =>
      part === "rn" ? "m" : (glyphs[part] ?? part)
    );
}

function withinTwoEdits(source: string, target: string): boolean {
  const left = Array.from(source);
  const right = Array.from(target);
  if (Math.abs(left.length - right.length) > 2) {
    return false;
  }
  let previous = new Map([
    [0, 0],
    [1, 1],
    [2, 2],
  ]);
  for (let i = 1; i <= left.length; i += 1) {
    const row = new Map([[0, i]]);
    for (
      let j = Math.max(1, i - 2);
      j <= Math.min(right.length, i + 2);
      j += 1
    ) {
      row.set(
        j,
        Math.min(
          (previous.get(j) ?? 3) + 1,
          (row.get(j - 1) ?? 3) + 1,
          (previous.get(j - 1) ?? 3) + Number(left[i - 1] !== right[j - 1])
        )
      );
    }
    previous = row;
  }
  return (previous.get(right.length) ?? 3) <= 2;
}

export function lookalikeOf(
  value: string,
  candidates: (number | string)[]
): boolean {
  const domain = value.toLowerCase();
  const known = candidates
    .filter((entry) => typeof entry === "string")
    .map((entry) => entry.toLowerCase());
  if (known.includes(domain)) {
    return false;
  }
  return known.some(
    (entry) =>
      withinTwoEdits(domain, entry) || skeleton(domain) === skeleton(entry)
  );
}
