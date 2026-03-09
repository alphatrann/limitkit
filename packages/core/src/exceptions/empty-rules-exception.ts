export class EmptyRulesException extends Error {
  constructor() {
    super("The rate limit rules are empty. Ensure there is at least one rule");
    this.name = "EMPTY_RULES_EXCEPTION";
  }
}
