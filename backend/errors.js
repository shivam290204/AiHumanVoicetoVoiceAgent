'use strict';

class AppError extends Error {
  constructor(message, statusCode = 500, code = 'APP_ERROR', details = {}) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

function toPublicError(error) {
  if (error instanceof AppError) {
    return { error: { code: error.code, message: error.message, details: error.details } };
  }
  return {
    error: {
      code: 'UNEXPECTED_ERROR',
      message: 'Something went wrong while handling the voice turn.'
    }
  };
}

module.exports = { AppError, toPublicError };
