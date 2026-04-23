<template>
    <template v-for="row, i in rows">
        <template v-for="component, j in row">
            <div v-if="component.text !== undefined" v-text="component.text"
                :class="classFor(component, i, j)"
                :style="styleFor(component, i, j)"
                :ref="cellAssociate(component)"></div>
            <div v-if="component.vue !== undefined"
                :class="classFor(component, i, j)"
                :style="styleFor(component, i, j)"
                :ref="cellAssociate(component)">
                <component :is="component.vue.type"
                    :="component.vue.props" v-on="component.vue.handlers"/>
            </div>

            <template v-if="component.subrows">
                <GridRows :rows="component.subrows"
                          :startPos="{row: startPos.row + startHeight(i), 
                                      col: startPos.col + startWidth(i, j)}"
                          :directMap="directMap"/>
            </template>
        </template>
    </template>
</template>

<script lang="ts">
import _ from 'lodash';
import { VNodeRef } from 'vue';
import { Vue, Component, Prop, toNative } from 'vue-facing-decorator';

import type { Cell }  from './index.vue';


@Component({name: 'GridRows'})
class IGridRows extends Vue {
    @Prop rows: Cell[][]
    @Prop({default: {row: 0, col: 0}})
    startPos: {row: number, col: number}

    @Prop directMap: Map<Element, Cell>

    classFor(cell: Cell, row: number, col: number) {
        let base = Array.isArray(cell.class)
            ? cell.class : cell.class ? [cell.class] : [];
        return base;
    }

    styleFor(cell: Cell, row: number, col: number) {
        return {'--rowspan': cell.rowspan,
                '--rowstart': 1 + this.startPos.row + this.startHeight(row),
                '--colspan': cell.colspan,
                '--colstart': 1 + this.startPos.col + this.startWidth(row, col)}
    }

    startHeight(row: number) {
        return _.sum(this.rows.slice(0, row).map(row =>
            row[0]?.rowspan ?? 1))
    }

    startWidth(row: number, col: number) {
        return _.sum(this.rows[row].slice(0, col).map(cell =>
            this.cellWidth(cell)));
    }

    rowWidth(row: Cell[]) {
        return _.sum(row.map(c => this.cellWidth(c)));
    }

    cellWidth(cell: Cell) {
        return cell.colspan ?? (cell.subrows ? 
            _.max(cell.subrows.map(row => this.rowWidth(row))) : 1);
    }

    cellAssociate(cell: Cell): VNodeRef {
        return ($el: Element) => {
            if (this.directMap) this.directMap.set($el, cell);
        };
    }
}

export default toNative(IGridRows);
</script>