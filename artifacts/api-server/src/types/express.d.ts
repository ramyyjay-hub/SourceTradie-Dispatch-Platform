import type { PrincipalRecord } from "../lib/source-tradie-repository";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        principal: PrincipalRecord;
        tokenSubject: string;
      };
    }
  }
}

export {};
