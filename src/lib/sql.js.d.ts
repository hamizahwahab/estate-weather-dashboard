declare module "sql.js" {
  interface SqlJsStatic {
    Database: new (data?: ArrayLike<number> | Buffer | null) => Database;
  }

  interface QueryExecResult {
    columns: string[];
    values: any[][];
  }

  interface Statement {
    bind(params?: any[]): boolean;
    step(): boolean;
    reset(): void;
    getAsObject(params?: object): Record<string, any>;
    free(): boolean;
  }

  interface Database {
    run(sql: string, params?: any[]): Database;
    exec(sql: string, params?: any[]): QueryExecResult[];
    prepare(sql: string): Statement;
    export(): Uint8Array;
    close(): void;
  }

  interface SqlJsConfig {
    locateFile?: (file: string) => string;
  }

  export { Database };
  export type { Statement, QueryExecResult, SqlJsStatic };

  export default function initSqlJs(config?: SqlJsConfig): Promise<SqlJsStatic>;
}
