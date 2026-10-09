import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

type Value = string | Map<string, string>;

/**
 * Minimal stand-in for the Upstash Redis REST API (single commands and
 * pipelines, base64-encoded results), for the commands the push store uses.
 */
export async function startFakeUpstash() {
  const data = new Map<string, Value>();
  const expires = new Map<string, number>();
  const commands: string[][] = [];

  const alive = (key: string) => {
    const until = expires.get(key);
    if (until !== undefined && until <= Date.now()) {
      data.delete(key);
      expires.delete(key);
    }
    return data.get(key);
  };
  const hash = (key: string) => {
    const value = alive(key);
    if (value instanceof Map) return value;
    const created = new Map<string, string>();
    data.set(key, created);
    return created;
  };

  function run([name, ...args]: (string | number)[]): unknown {
    const [key, ...rest] = args.map(String);
    switch (String(name).toUpperCase()) {
      case "GET": {
        const value = alive(key);
        return typeof value === "string" ? value : null;
      }
      case "SET": {
        const [value, ...options] = rest;
        const upper = options.map((option) => option.toUpperCase());
        if (upper.includes("NX") && alive(key) !== undefined) return null;
        data.set(key, value);
        const ex = upper.indexOf("EX");
        if (ex >= 0) expires.set(key, Date.now() + Number(options[ex + 1]) * 1000);
        else expires.delete(key);
        return "OK";
      }
      case "DEL":
        return [key, ...rest].filter((item) => data.delete(item)).length;
      case "HSET": {
        const target = hash(key);
        let added = 0;
        for (let index = 0; index < rest.length; index += 2) {
          if (!target.has(rest[index])) added += 1;
          target.set(rest[index], rest[index + 1]);
        }
        return added;
      }
      case "HGET":
        return (alive(key) as Map<string, string> | undefined)?.get(rest[0]) ?? null;
      case "HDEL": {
        const target = alive(key) as Map<string, string> | undefined;
        return rest.filter((field) => target?.delete(field)).length;
      }
      case "HLEN":
        return (alive(key) as Map<string, string> | undefined)?.size ?? 0;
      case "HGETALL":
        return [...((alive(key) as Map<string, string> | undefined) ?? new Map())].flat();
      default:
        throw new Error(`Befehl ${name} nicht nachgebaut`);
    }
  }

  const encode = (value: unknown): unknown =>
    typeof value === "string"
      ? Buffer.from(value).toString("base64")
      : Array.isArray(value)
        ? value.map(encode)
        : value;

  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    const base64 = request.headers["upstash-encoding"] === "base64";
    const reply = (command: (string | number)[]) => {
      commands.push(command.map(String));
      try {
        const result = run(command);
        return { result: base64 ? encode(result) : result };
      } catch (error) {
        return { error: (error as Error).message };
      }
    };
    const parsed = JSON.parse(body) as (string | number)[] | (string | number)[][];
    const result = request.url?.startsWith("/pipeline")
      ? (parsed as (string | number)[][]).map(reply)
      : reply(parsed as (string | number)[]);
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(result));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    commands,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
