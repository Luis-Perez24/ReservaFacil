export const UserRole = {
  OWNER: 'OWNER',
  STAFF: 'STAFF',
  CLIENT: 'CLIENT',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];
