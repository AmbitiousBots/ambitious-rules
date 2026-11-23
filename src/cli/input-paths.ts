import { readlinkSync } from "node:fs";
import { dirname, isAbsolute, join, parse, sep } from "node:path";
import type { Command } from "@ambitious/kit/cli/command";
import { failure } from "@ambitious/kit/domain/failure";
import { AGENT_DATA_ROOT } from "@ambitious/kit/paths/refuse-agent-data";

function linkAt(path: string) {
  try {
    return readlinkSync(path);
  } catch (error) {
    if (error instanceof Error && "code" in error &&
        ["ENOENT", "EINVAL", "ENOTDIR", "ENAMETOOLONG"].includes(String(error.code))) return;
    throw failure("E_FORBIDDEN_PATH", "The input path could not be checked.", "Use an accessible path.");
  }
}

function refusePrivate(path: string, roots: readonly string[]) {
  if (roots.some(root => path === root || path.startsWith(root + sep))) {
    throw failure("E_FORBIDDEN_PATH", "The path enters the private data directory.", "Use a path outside the private directory.");
  }
}

function resolvePath(path: string, privateRoots: readonly string[]): string {
  const pending = path.split(sep).reverse();
  let current = isAbsolute(path) ? parse(path).root : process.cwd();
  let links = 0;
  while (pending.length) {
    const part = pending.pop();
    if (!part || part === ".") continue;
    if (part === "..") {
      current = dirname(current);
      continue;
    }
    const next = join(current, part);
    refusePrivate(next, privateRoots);
    const target = linkAt(next);
    if (target === undefined) {
      current = next;
      continue;
    }
    if (++links > 40) throw failure("E_FORBIDDEN_PATH", "Too many symbolic links.", "Use a direct path.");
    if (isAbsolute(target)) current = parse(target).root;
    for (const component of target.split(sep).reverse()) pending.push(component);
  }
  refusePrivate(current, privateRoots);
  return current;
}

export function pathGuard() {
  const privateRoots = [AGENT_DATA_ROOT, resolvePath(AGENT_DATA_ROOT, [])];
  return (path: string) => {
    if (path && !path.includes("\0")) resolvePath(path, privateRoots);
  };
}

export function checkInputPaths(command: Command): Command {
  return {
    ...command,
    get access() { return command.access; },
    parse(raw) {
      const checkPath = pathGuard();
      const pending: unknown[] = [raw];
      while (pending.length) {
        const value = pending.pop();
        if (typeof value === "string") checkPath(value);
        if (value !== null && typeof value === "object") {
          for (const child of Object.values(value)) pending.push(child);
        }
      }
      return command.parse(raw);
    },
  };
}
