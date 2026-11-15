/**
 * Growable columnar storage for the event streams of `DemoResult` (shots,
 * hits): one typed array per field, grown by doubling, snapshotted into
 * right-sized arrays that each own their `ArrayBuffer` (so they can go in a
 * `postMessage` transfer list).
 */

type Column = Int32Array | Uint32Array | Uint16Array | Uint8Array | Float32Array;
type ColumnConstructor = new (length: number) => Column;

/** Field name → typed-array constructor. */
export type ColumnSpec = Readonly<Record<string, ColumnConstructor>>;

/** The arrays a {@link ColumnSpec} describes. */
export type ColumnsOf<S extends ColumnSpec> = { -readonly [K in keyof S]: InstanceType<S[K]> };

export class ColumnTable<S extends ColumnSpec> {
  /** Number of rows written. */
  length = 0;
  /** Current backing arrays; reallocated on growth, so re-read after {@link addRow}. */
  columns: ColumnsOf<S>;
  private capacity: number;

  constructor(
    private readonly spec: S,
    initialCapacity = 1024,
  ) {
    this.capacity = Math.max(1, initialCapacity);
    this.columns = this.allocate(this.capacity);
  }

  /** Reserve the next row and return its index. */
  addRow(): number {
    if (this.length === this.capacity) {
      this.capacity *= 2;
      const next = this.allocate(this.capacity);
      for (const key in this.spec) next[key].set(this.columns[key] as never);
      this.columns = next;
    }
    return this.length++;
  }

  /** Right-sized copies of every column. */
  snapshot(): ColumnsOf<S> {
    const out = {} as ColumnsOf<S>;
    for (const key in this.spec) out[key] = this.columns[key].slice(0, this.length) as never;
    return out;
  }

  private allocate(capacity: number): ColumnsOf<S> {
    const out = {} as ColumnsOf<S>;
    for (const key in this.spec) out[key] = new this.spec[key]!(capacity) as never;
    return out;
  }
}

/** Interns strings into a table so a column can store small integer ids. */
export class StringTable {
  readonly values: string[] = [];
  private readonly ids = new Map<string, number>();

  id(value: string): number {
    let id = this.ids.get(value);
    if (id === undefined) {
      id = this.values.length;
      this.values.push(value);
      this.ids.set(value, id);
    }
    return id;
  }
}
