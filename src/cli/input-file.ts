import { constants, lstatSync, realpathSync } from "node:fs";
import { open } from "node:fs/promises";
import { Failure, failure } from "@ambitious/kit/domain/failure";
import { refuseAgentData } from "@ambitious/kit/paths/refuse-agent-data";
import { pathGuard } from "./input-paths.ts";

const darwinNoFollowAny = 0x20000000;

export async function openInputFile(path: string) {
  const check = pathGuard();
  check(path);
  refuseAgentData(path);
  try {
    const resolved = realpathSync.native(path);
    check(resolved);
    const expected = lstatSync(resolved, { bigint: true });
    const noFollow = process.platform === "darwin" ? darwinNoFollowAny : (constants.O_NOFOLLOW ?? 0);
    const file = await open(resolved, constants.O_RDONLY | noFollow);
    try {
      const opened = await file.stat({ bigint: true });
      if (expected.dev !== opened.dev || expected.ino !== opened.ino)
        throw failure("E_FORBIDDEN_PATH", "The input file changed during open.", "Retry with a stable input file.");
      if (process.platform === "linux") check(realpathSync.native(`/proc/self/fd/${file.fd}`));
      return file.createReadStream();
    } catch (error) {
      await file.close();
      throw error;
    }
  } catch (error) {
    if (error instanceof Failure) throw error;
    throw failure("E_INPUT_SCHEMA", "The input file could not be read.", "Pass --in the path of a readable JSON file.");
  }
}
