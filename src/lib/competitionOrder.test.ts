import { describe, expect, it } from 'vitest'
import { moveInOrder } from './competitionOrder'

const L = (...ids: string[]) => ids.map((id, k) => ({ id, sort_order: (k + 1) * 10 }))

describe('moveInOrder', () => {
  it('flytter ned og bytter plass med naboen', () => {
    const r = moveInOrder(L('a', 'b', 'c'), 'a', 1)
    expect(r.list.map((x) => x.id)).toEqual(['b', 'a', 'c'])
    expect(r.changes).toEqual([{ id: 'b', sort_order: 10 }, { id: 'a', sort_order: 20 }])
  })
  it('flytter opp', () => {
    const r = moveInOrder(L('a', 'b', 'c'), 'c', -1)
    expect(r.list.map((x) => x.id)).toEqual(['a', 'c', 'b'])
    expect(r.changes.map((c) => c.id).sort()).toEqual(['b', 'c'])
  })
  it('øverste kan ikke opp og nederste ikke ned', () => {
    expect(moveInOrder(L('a', 'b'), 'a', -1).changes).toEqual([])
    expect(moveInOrder(L('a', 'b'), 'b', 1).changes).toEqual([])
  })
  it('ukjent id gjør ingenting', () => { expect(moveInOrder(L('a'), 'x', 1).changes).toEqual([]) })
  it('normaliserer rekkefølger som har like eller rare tall', () => {
    const r = moveInOrder([{ id: 'a', sort_order: 0 }, { id: 'b', sort_order: 0 }, { id: 'c', sort_order: 0 }], 'a', 1)
    expect(r.list.map((x) => x.sort_order)).toEqual([10, 20, 30])
  })
})
