// StepStore: the Store a command handler, system tick or event handler
// actually receives. Reads and writes go straight to the host's store; `emit`
// is held in a queue that `dispatch` drains after the step. An event reaches
// the host's event log only when it is dispatched, so the log order is the
// dispatch order, and a command that returns a Rejection leaves no events.

import type { GameEvent } from '../events/index.ts'
import type { IndexOf, IndexVal, PkOf, Rng, Row, Store, TableName, Timestamp } from '../store/types.ts'

export class StepStore implements Store {
  private readonly pending: GameEvent[] = []
  private head = 0

  constructor(readonly base: Store) {}

  get<T extends TableName>(t: T, id: PkOf<T>): Readonly<Row<T>> | undefined {
    return this.base.get(t, id)
  }

  byIndex<T extends TableName, K extends IndexOf<T>>(t: T, k: K, v: IndexVal<T, K>): Iterable<Readonly<Row<T>>> {
    return this.base.byIndex(t, k, v)
  }

  insert<T extends TableName>(t: T, row: Row<T>): void {
    this.base.insert(t, row)
  }

  update<T extends TableName>(t: T, row: Row<T>): void {
    this.base.update(t, row)
  }

  delete<T extends TableName>(t: T, id: PkOf<T>): void {
    this.base.delete(t, id)
  }

  now(): Timestamp {
    return this.base.now()
  }

  rng(): Rng {
    return this.base.rng()
  }

  emit(e: GameEvent): void {
    this.pending.push(e)
  }

  /** The oldest undispatched event, or `undefined` when the queue is empty. */
  take(): GameEvent | undefined {
    if (this.head === this.pending.length) return undefined
    const e = this.pending[this.head]
    this.head += 1
    return e
  }
}
