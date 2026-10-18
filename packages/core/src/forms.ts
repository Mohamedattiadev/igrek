/**
 * Forms an agent asks the user to fill (plan.md 16.3 #13). The schema is the flat subset of JSON
 * Schema that MCP elicitation allows: one object whose properties are strings (optionally an enum),
 * numbers, integers or booleans. Anything else is dropped, so a form can never ask for more than
 * a few plain answers.
 */

export interface FormField {
  key: string;
  type: "string" | "number" | "integer" | "boolean";
  label: string;
  description?: string;
  required: boolean;
  options?: string[];
  default?: string | number | boolean;
  min?: number;
  max?: number;
  /** Long free text gets a multi-line box. */
  multiline?: boolean;
}

export type FormAnswers = Record<string, string | number | boolean>;

const MAX_FIELDS = 20;
const MAX_TEXT = 4000;

type Json = Record<string, unknown>;

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

function addTextLimits(field: FormField, raw: Json): void {
  const options = Array.isArray(raw.enum)
    ? raw.enum.filter((o): o is string => typeof o === "string").slice(0, 30)
    : [];
  if (options.length) field.options = options;
  field.min = num(raw.minLength);
  field.max = Math.min(num(raw.maxLength) ?? MAX_TEXT, MAX_TEXT);
  field.multiline = field.max > 200 && !field.options;
}

function fieldOf(key: string, raw: Json, required: boolean): FormField | undefined {
  const type = raw.type;
  if (type !== "string" && type !== "number" && type !== "integer" && type !== "boolean") return undefined;
  const label = typeof raw.title === "string" && raw.title.trim() ? raw.title.trim().slice(0, 120) : key;
  const field: FormField = { key, type, label, required };
  if (typeof raw.description === "string" && raw.description.trim())
    field.description = raw.description.trim().slice(0, 300);
  if (type === "string") addTextLimits(field, raw);
  else if (type !== "boolean") {
    field.min = num(raw.minimum);
    field.max = num(raw.maximum);
  }
  const d = raw.default;
  if (typeof d === (type === "integer" ? "number" : type)) field.default = d as string | number | boolean;
  return field;
}

/** The fields of a form schema; throws when nothing usable is left. */
export function formFields(schema: unknown): FormField[] {
  const s = (schema ?? {}) as Json;
  const properties = (s.properties ?? {}) as Record<string, unknown>;
  const required = new Set(Array.isArray(s.required) ? s.required.filter((r) => typeof r === "string") : []);
  const fields: FormField[] = [];
  for (const [key, raw] of Object.entries(properties)) {
    if (!/^[\w.-]{1,64}$/.test(key) || typeof raw !== "object" || raw === null) continue;
    const field = fieldOf(key, raw as Json, required.has(key));
    if (field) fields.push(field);
    if (fields.length === MAX_FIELDS) break;
  }
  if (!fields.length) throw new Error("The form has no usable fields (strings, numbers or yes/no only)");
  return fields;
}

function checkText(field: FormField, value: unknown): string {
  const text = String(value);
  if (field.options && !field.options.includes(text)) throw new Error(`${field.label}: pick one of the options`);
  if (field.min !== undefined && text.length < field.min) throw new Error(`${field.label}: too short`);
  if (field.max !== undefined && text.length > field.max) throw new Error(`${field.label}: too long`);
  return text;
}

function checkNumber(field: FormField, value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || (field.type === "integer" && !Number.isInteger(n)))
    throw new Error(`${field.label}: ${field.type === "integer" ? "a whole number" : "a number"}`);
  if (field.min !== undefined && n < field.min) throw new Error(`${field.label}: at least ${field.min}`);
  if (field.max !== undefined && n > field.max) throw new Error(`${field.label}: at most ${field.max}`);
  return n;
}

function checkValue(field: FormField, value: unknown): string | number | boolean {
  if (field.type === "boolean") {
    if (typeof value !== "boolean") throw new Error(`${field.label}: yes or no`);
    return value;
  }
  return field.type === "string" ? checkText(field, value) : checkNumber(field, value);
}

/** Only the form's own fields, each checked; throws with the first problem. */
export function checkAnswers(fields: FormField[], answers: unknown): FormAnswers {
  const given = (answers ?? {}) as Json;
  const out: FormAnswers = {};
  for (const field of fields) {
    const value = given[field.key];
    const empty = value === undefined || value === null || value === "";
    if (empty) {
      if (field.required) throw new Error(`${field.label}: required`);
      continue;
    }
    out[field.key] = checkValue(field, value);
  }
  return out;
}
