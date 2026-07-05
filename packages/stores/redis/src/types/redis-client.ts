export type RedisScriptResult = [number, number, number, number];

export interface NodeRedisCompatibleClient {
  scriptLoad(script: string): Promise<string>;
  evalSha(
    sha: string,
    options: { keys: string[]; arguments: string[] },
  ): Promise<unknown>;
}

export interface IoRedisCompatibleClient {
  script(command: "LOAD", script: string): Promise<string>;
  evalsha(
    sha: string,
    numberOfKeys: number,
    ...args: string[]
  ): Promise<unknown>;
}

export type RedisClientLike =
  | NodeRedisCompatibleClient
  | IoRedisCompatibleClient;

