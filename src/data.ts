import _ from 'lodash';
import { flatmap, imap } from 'itertools';
import { Cell } from './index.vue';
import { dateTimeShort } from './infra/datetime';


class Gridlet {
    d: Cell[][]
    
    constructor(cellData: Cell[][] = []) {
        this.d = cellData;
    }

    get height() {
        return _.sum(this.d.map(r => this.rowHeight(r)));
    }

    get width() {
        return this.rowWidth(this.d[0] ?? []);
    }

    rowHeight(row: Cell[]) {
        return row[0]?.rowspan ?? 1;
    }

    rowWidth(row: Cell[]) {
        return _.sum(row.map(c => c.colspan ?? 1));
    }

    happend(subgrid: Gridlet) {
        this._compact(); subgrid = subgrid._compact();

        let w = this.width, subh = subgrid.height, subw = subgrid.width;
        while (this.height < subh) {
            this.d.push(this._hfill(w));
        }
        /** @todo this is inconsistent if subrows exist */
        for (let i = 0; i < subgrid.d.length; ++i)
            this.d[i] = this.d[i].concat(subgrid.d[i]);
        for (let i = subgrid.d.length; i < this.d.length; ++i)
            this.d[i].push(...this._hfill(subw));
    }

    _hfill(width: number): Cell[] {
        return width > 0 ? [{text: '', colspan: width}] : [];
    }

    _compact() {
        this.d.splice(1, Infinity,
            ...this.d.slice(1).filter(x => x.some(v => v.text !== undefined)));
        return this;
    }
}


class HierarchicalHeader {
    labels: NestedMap<Key>

    constructor(labels?: HierarchicalHeader['labels']) {
        this.labels = labels ?? new Map;
    }

    fromKeyPaths(keypaths: Iterable<Key[]>) {
        for (let key of keypaths) {
            let hm = this.labels;
            for (let el of key) {
                let sub = hm.get(el) ?? new Map();
                hm.set(el, sub);
                hm = sub;
            }
        }
        return this;
    }

    forObjects(objs: object[]) {
        return this.fromKeyPaths(flatmap(objs, o =>
            flattenObjectEntries(o).map(([k, v]) => k)));
    }

    sub(kp: string[]) {
        let h = this.labels;
        for (let k of kp) h = h?.get(k);
        if (!h) throw new Error(`no subheader: '${kp}'`)
        return new HierarchicalHeader(h);
    }

    gridify() {
        return this._cleanup(aux(this.labels));

        function aux(h: NestedMap<Key>): Gridlet {
            let grid = new Gridlet();

            for (let [k, v] of h.entries()) {
                let subgrid = aux(v);
                subgrid.d.unshift([{
                    text: k === SPREAD ? undefined : `${k}`,
                    class: 'header',
                    colspan: subgrid.width || 1
                }]);
                grid.happend(subgrid);
            }

            return grid;
        }
    }

    _cleanup(grid: Gridlet) {
        for (let r of grid.d)
            for (let c of r)
                c.text ??= '';
        return grid;
    }

    *traverse(obj: any) {
        yield* aux(obj, this.labels);

        function *aux(obj: any, h: NestedMap<Key>, pfx: Key[] = []) {
            if (h.size === 0) yield [pfx, obj]
            else {
                for (let [k, v] of h.entries()) {
                    if (k === SPREAD) 
                        yield [[...pfx, k], Array.isArray(obj) ? obj : undefined];                    
                    else
                        yield* aux(obj?.[k], v, [...pfx, k]);
                }
            }
        }
    }
}

class GridWidget {
    constructor(public payload: object) { }
}

type NestedMap<T> = Map<T, NestedMap<T>>;

type Key = string | number;
const SPREAD = Infinity;


function fromObjects(objs: object[]) {
    if (!Array.isArray(objs)) objs = [objs];

    let header = new HierarchicalHeader().forObjects(objs);

    function subrows(objs: any[], header: HierarchicalHeader, pfx: Key[] = []) {
        let npfx = (kp: Key[], idx: number) => //
            [...pfx, idx, ...kp.slice(-1)[0] === SPREAD ? kp.slice(0, -1) : kp]

        return objs.map((row, idx) => [...header.traverse(row)].map(([kp, v]) =>
            Array.isArray(v) ? {subrows: subrows(v, header.sub(kp), npfx(kp, idx))}
                             : {...valueDisplay(v), path: npfx(kp, idx)}));
    }

    return [
        ...header.gridify().d,
        ...subrows(objs, header)
    ];
}

/**
 * Creates a canonical textual or other display for a value.
 * (for now, not much to see here.)
 */
function valueDisplay(value: any) {
    if (typeof value === 'number' && !Number.isInteger(value))
        return {text: Math.round(value * 1e5) / 1e5};
    else if (value instanceof Date)
        return {text: dateTimeShort(value)};
    else if (value instanceof Function)
        return {text: '𝒻'}
    else if (value instanceof GridWidget)
        return value.payload;
    else
        return {text: value ?? ''}
}

function flattenObject(o: object) {
    return Object.fromEntries(flattenObjectEntries(o));
}

function flattenObjectEntries(o: object) {
    return [...iflattenObjectEntries(o)];
}


function *iflattenObjectEntries(o: object, level=0): Iterable<[Key[], any]> {

    let pfx = (pfx: Key[], sub: Iterable<[Key[], any]>) =>
        imap(sub, ([subk, subv]) => [[...pfx, ...subk], subv] as [Key[], any]);

    if (Array.isArray(o)) {
        if (level == 0) {
            yield* o.map((v, i) =>  [[i], v] as [Key[], any]);
        }
        else {
            for (let el of o) {
                yield* typeof el === 'object' ?
                    pfx([SPREAD], iflattenObjectEntries(el)) : [[[SPREAD], el]];
            }
        }
    }
    else {
        if (typeof o['_'] === 'object') o = o['_'];
        yield* flatmap(Object.entries(o), ([k ,v]) =>
            typeof v === 'object' && v !== null && !(v instanceof Date || v instanceof GridWidget) ?
                pfx([k], iflattenObjectEntries(v, level + 1))
              : [[[k], v]]
        );
    }
}

export { Gridlet, HierarchicalHeader, GridWidget, Key,
         fromObjects, flattenObject, flattenObjectEntries }