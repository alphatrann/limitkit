export class UndefinedKeyException extends Error {
  constructor(ruleName: string) {
    super(
      `Rule "${ruleName}" returned undefined or empty key. Double-check your key function.`,
    );
  }
}
