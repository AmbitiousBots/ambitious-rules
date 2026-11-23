import { z } from "zod";
import { failure } from "@ambitious/kit/domain/failure";
import { identifier as id, RuleSchema, WorkflowItemSchema, WorkflowSchema } from "./schema.ts";

const positive = z.int().positive();
export const normalizeReceiptKey = (key: string) => key.trim();
const writeFields = { idem_key: z.string().transform(normalizeReceiptKey).pipe(id).optional(), actor: id.optional() };
export const putInput = z.strictObject({ workflow: WorkflowSchema, ...writeFields });
export const getInput = z.strictObject({ id, version: positive.optional() });
export const historyInput = z.strictObject({ id });
export const setInput = z.strictObject({ workflow_id: id, rule: RuleSchema, ...writeFields });
export const toggleInput = z.strictObject({ workflow_id: id, rule_id: id, ...writeFields });
export const traceInput = z.strictObject({ id: positive });
export const listTracesInput = z.strictObject({ workflow_id: id.optional(), limit: positive.max(1000).default(50) });
export const seedInput = z.strictObject(writeFields);
export const evaluateInput = z.strictObject({
  workflow_id: id.optional(),
  workflow: WorkflowSchema.optional(),
  item: WorkflowItemSchema,
  version: positive.optional(),
  record: z.boolean().default(false),
  idem_key: writeFields.idem_key,
}).superRefine((input, ctx) => {
  if ((input.workflow_id === undefined) === (input.workflow === undefined))
    ctx.addIssue({ code: "custom", message: "Supply exactly one of workflow_id and workflow." });
  if (input.workflow && input.version !== undefined)
    ctx.addIssue({ code: "custom", path: ["version"], message: "A numbered version requires workflow_id." });
  if (input.idem_key !== undefined && !input.record)
    ctx.addIssue({ code: "custom", path: ["idem_key"], message: "A recording key requires record: true." });
});

export const parse = <S extends z.ZodType>(schema: S) => (value: unknown): z.output<S> => {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  throw failure("E_INPUT_SCHEMA", `${issue?.path.join(".") || "input"}: ${issue?.message ?? "Invalid input."}`,
    "Check the command input and resend the corrected JSON.");
};

export const parseGet = parse(getInput);

export const parseHistory = parse(historyInput);

export const parseListTraces = parse(listTracesInput);

export const parsePut = parse(putInput);

export const parseSeed = parse(seedInput);

export const parseSet = parse(setInput);

export const parseToggle = parse(toggleInput);

export const parseTrace = parse(traceInput);
