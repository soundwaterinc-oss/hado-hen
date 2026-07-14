// controls.ts — tiny DOM builders for the minimal control surface.

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, cls?: string, text?: string
): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

export function slider(
  label: string, min: number, max: number, step: number, value: number,
  fmt: (v: number) => string, onInput: (v: number) => void
): HTMLElement {
  const wrap = el("div", "ctl");
  const lab = el("label", undefined, label);
  const range = el("input");
  range.type = "range"; range.min = String(min); range.max = String(max);
  range.step = String(step); range.value = String(value);
  const val = el("span", "val", fmt(value));
  range.addEventListener("input", () => {
    const v = parseFloat(range.value);
    val.textContent = fmt(v);
    onInput(v);
  });
  wrap.append(lab, range, val);
  return wrap;
}

export function select(
  options: string[], value: string, onChange: (v: string) => void, cls?: string
): HTMLSelectElement {
  const s = el("select", cls);
  for (const o of options) {
    const opt = el("option"); opt.value = o; opt.textContent = o;
    if (o === value) opt.selected = true;
    s.appendChild(opt);
  }
  s.addEventListener("change", () => onChange(s.value));
  return s;
}
