export class BadArgumentsException extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BAD_ARGUMENTS_EXCEPTION";
  }
}
