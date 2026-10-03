import { readFile, mkdir, writeFile } from "node:fs/promises";
import { sandboxConfiguration } from "@/lib/sandbox/config.server";

/** Prepare the console/OpenAPI specification without widening cloud permissions. */
async function main() {
  const config = sandboxConfiguration();
  const script = (await readFile("scripts/sandbox/template-dependencies.sh", "utf8")).replaceAll("\r\n", "\n");
  const spec = {
    name: "studysolo-skills-v2-20261004", team: "studysolo-agent", region: config.region,
    generation: 2, cpu: 2, memoryMiB: 2048, diskMiB: 15360,
    image: `fc-e2b-registry.${config.region}.cr.aliyuncs.com/runtime-v2/base:v0.0.53`,
    startCommand: `printf '%s' '${Buffer.from(script).toString("base64")}' | base64 -d > /tmp/studysolo-build.sh; timeout 300 bash /tmp/studysolo-build.sh; sleep infinity`,
    readyCommand: "test -f /opt/studysolo/runtime-ready.json",
    note: "Submit as generation 2 through the console or sandbox OpenAPI. E2B 2.31 Template.build defaults to a generation that rejects startCmd. If build exceeds five minutes, use a prebuilt OCI image. Do not put credentials or tenant files in that image.",
  };
  await mkdir(".local-archive/connectors-private", { recursive: true, mode: 0o700 });
  await writeFile(".local-archive/connectors-private/skills-template-spec.json", JSON.stringify(spec, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ stage: "skills-template", state: "specification-prepared", generation: 2, cpu: 2, memoryMiB: 2048 }));
}
main().catch(() => { console.error("skills-template: configuration unavailable"); process.exitCode = 1; });
