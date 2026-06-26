// Minimal Prisma enums for unit tests (no DB connection required)
export enum BreachFlag {
  YES = 'YES',
  NO = 'NO',
  UNKNOWN = 'UNKNOWN',
}

export enum PersonRole {
  MANAGER = 'MANAGER',
  ENGINEER = 'ENGINEER',
  BOTH = 'BOTH',
}

export enum DelayStatus {
  NOT_DELAYED = 'NOT_DELAYED',
  DELAYED = 'DELAYED',
  AT_RISK = 'AT_RISK',
  UNKNOWN = 'UNKNOWN',
}

export const PrismaClient = class {}

export interface RootCauseRule {
  id: string
  bucket: string
  keywords: string[]
  priority: number
}
