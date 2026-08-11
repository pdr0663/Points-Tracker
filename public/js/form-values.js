export function requiredFormNumber(raw, name) {
  if (typeof raw !== "string" || !raw.trim()) throw new TypeError(`${name} must be a number.`);
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be a number.`);
  return value;
}
