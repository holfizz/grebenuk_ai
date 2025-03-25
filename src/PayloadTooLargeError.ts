import { ArgumentsHost, Catch, ExceptionFilter, PayloadTooLargeException } from "@nestjs/common";
import { Request, Response } from "express";

@Catch(PayloadTooLargeException)
export class FileTooLargeExceptionFilter implements ExceptionFilter {
  catch(exception: PayloadTooLargeException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();

    response.status(status).json({
      statusCode: status,
      message: "File size exceeds the maximum allowed limit of 100MB",
      error: "PayloadTooLargeError",
      path: request.url,
    });
  }
}
