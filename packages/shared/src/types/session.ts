export const SESSION_TYPE = {
  FOCUS: 'FOCUS',
  SHORT_BREAK: 'SHORT_BREAK',
  LONG_BREAK: 'LONG_BREAK',
} as const;

export type SessionType = (typeof SESSION_TYPE)[keyof typeof SESSION_TYPE];
