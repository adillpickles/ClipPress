export class DirectoryAccessDeclinedError extends Error {
  constructor() {
    super();
    this.name = 'DirectoryAccessDeclinedError';
  }
}

export class UnsupportedFileError extends Error {
  constructor(message: string, opts?: ErrorOptions) {
    super(message, opts);
    this.name = 'UnsupportedFileError';
  }
}

export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserFacingError';
  }
}

/** Every file of an export came out empty (a header, no picture or sound), so it didn't work. */
export class EmptyExportError extends Error {
  constructor() {
    super('The export came out empty');
    this.name = 'EmptyExportError';
  }
}
