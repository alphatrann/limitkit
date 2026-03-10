export class UnknownAlgorithmException extends Error {
  constructor(algorithm: string) {
    super(`Found unknown algorithm: ${algorithm}`);
    this.name = "UNKNOWN_ALGORITHM_EXCEPTION";
  }
}
