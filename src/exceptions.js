export class RobloxError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "RobloxError";
    this.code = code;
  }
}

export class AuthError extends RobloxError {
  constructor(message) {
    super(message, "AUTH_ERROR");
    this.name = "AuthError";
  }
}

export class TransportError extends RobloxError {
  constructor(message) {
    super(message, "TRANSPORT_ERROR");
    this.name = "TransportError";
  }
}

export class NotImplementedError extends RobloxError {
  constructor(feature) {
    super(
      `${feature} is not implemented yet. ` +
        "Implement the RakNet packet spec or use the web transport fallback.",
      "NOT_IMPLEMENTED"
    );
    this.name = "NotImplementedError";
  }
}
