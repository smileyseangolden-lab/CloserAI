import { customType } from 'drizzle-orm/pg-core';

export const vector = (name: string, config: { dimensions: number }) =>
  customType<{ data: number[]; driverData: string; config: { dimensions: number } }>({
    dataType(c) {
      return `vector(${c?.dimensions ?? config.dimensions})`;
    },
    toDriver(value: number[]): string {
      return `[${value.join(',')}]`;
    },
    fromDriver(value: string | number[]): number[] {
      if (Array.isArray(value)) return value;
      return JSON.parse(value) as number[];
    },
  })(name, config);
