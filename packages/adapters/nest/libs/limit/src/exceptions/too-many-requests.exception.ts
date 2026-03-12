import { HttpException, HttpStatus } from "@nestjs/common";

export class TooManyRequestsException extends HttpException {
  constructor(response: string | Record<string, any>) {
    super(response, HttpStatus.TOO_MANY_REQUESTS);
  }
}
