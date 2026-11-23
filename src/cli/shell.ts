import { randomInt } from "node:crypto";
import { cliEnvelope, type ModuleSpec } from "@ambitious/kit/cli/run-cli";
import { parseArgs } from "@ambitious/kit/domain/args";
import { MAX_SEED } from "@ambitious/kit/domain/clock";
import { envelope, exitCodeOf, serialize } from "@ambitious/kit/domain/envelope";
import { Failure, failure } from "@ambitious/kit/domain/failure";
import { maxInputBytes } from "../domain/encoding.ts";
import { openInputFile } from "./input-file.ts";
import { checkInputPaths } from "./input-paths.ts";

async function readUtf8(stream: AsyncIterable<Buffer>, requireEmpty = false): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for await (const chunk of stream) {
      size += chunk.length;
      if (requireEmpty && size > 0)
        throw failure("E_USAGE", "Input was given both on stdin and with --in.", "Supply JSON through one input source.");
      if (size > maxInputBytes)
        throw failure("E_INPUT_SCHEMA", "Input exceeds 1 MiB.", "Send at most 1,048,576 bytes of UTF-8 JSON.");
      chunks.push(chunk);
    }
  } catch (error) {
    if (error instanceof Failure) throw error;
    throw failure("E_INPUT_SCHEMA", "The input could not be read.", "Supply readable JSON on stdin or with --in.");
  }
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks, size));
  } catch {
    throw failure("E_INPUT_SCHEMA", "Input contains invalid UTF-8.", "Encode the JSON as UTF-8 and resend it.");
  }
}

export const runModule = async (spec: ModuleSpec, optionalInput: ReadonlySet<string>): Promise<void> => {
  const argv = process.argv.slice(2);
  const parsed = parseArgs(argv);
  const name = parsed.words.join(" ");
  const file = parsed.flags.in;
  if (file !== null && !parsed.flags.help && !parsed.problems.length && spec.commands[name]?.takesInput) {
    const index = argv.findIndex(arg => arg === "--in" || arg.startsWith("--in="));
    argv.splice(index, argv[index] === "--in" ? 2 : 1);
  }
  const readStdin = async (): Promise<string> => {
    const value = process.stdin.isTTY ? "" : await readUtf8(process.stdin, file !== null);
    if (file !== null) return readUtf8(await openInputFile(file));
    return value.trim() === "" && optionalInput.has(name) ? "{}" : value;
  };
  const commands = Object.fromEntries(Object.entries(spec.commands).map(([name, command]) => [name, checkInputPaths(command)]));
  const result = await cliEnvelope({ ...spec, commands }, {
    argv,
    env: process.env,
    binaryPath: process.argv[1] ?? "",
    readStdin,
    systemNow: () => new Date(),
    systemSeed: () => randomInt(0, MAX_SEED + 1),
    writeStdout: (text) => process.stdout.write(text),
    writeStderr: (text) => process.stderr.write(text),
  }).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    return envelope.err({ schemaVersion: spec.schemaVersion, module: spec.module, command: "",
      meta: { now: new Date().toISOString(), seed: 0, version: spec.version } },
    [{ code: "E_INTERNAL", message: "The module hit an unexpected error.", hint: "Report it with the stderr log." }]);
  });
  process.stdout.write(serialize(result));
  process.exitCode = exitCodeOf(result);
};
