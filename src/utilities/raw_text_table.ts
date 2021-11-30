/*type DataTypeOf<Column extends TextTableColumn<unknown>> = Column extends TextTableColumn<infer DataType> ? DataType : never;
export const enum Justify {
    Center = "Center",
    Left = "Left",
    Right = "Right",
}
class TextTableColumn<DataType> {
    title: string;
    id = Symbol();

    readonly #_serialize: (input: DataType) => string;

    get serialize() {
        return this.#_serialize;
    }

    constructor(title: string, serialize: (input: DataType) => string) {
        this.title = title;
        this.#_serialize = serialize;
    }
}

type ColumnsWithDataTypes<ColumnDataTypes extends readonly unknown[]> = {
    [K in keyof ColumnDataTypes & number]: TextTableColumn<ColumnDataTypes[K]>;
};

class TextTableRow<ColumnDataTypes extends readonly unknown[]> {
    #_values: Map<symbol, string>;
    columns: ColumnsWithDataTypes<ColumnDataTypes>;

    constructor(columns: ColumnsWithDataTypes<ColumnDataTypes>, values: ColumnDataTypes) {
        this.#_values = new Map();
        for (const [index, value] of values.entries()) {
            let column = columns[index];
            this.#_values.set(column.id, column.serialize(value));
        }
        this.columns = columns;
    }

    get_column_value(column: TextTableColumn<ColumnDataTypes[number]>) {
        return this.#_values.get(column.id);
    }

    get_values() {
        return this.#_values.values();
    }
}

class TextTable<ColumnDataTypes extends readonly unknown[]> {
    rows: TextTableRow<ColumnDataTypes>[];
    columns: ColumnsWithDataTypes<ColumnDataTypes>;

    constructor(columns: ColumnsWithDataTypes<ColumnDataTypes>) {
        this.rows = [];
        this.columns = columns;
    }

    add_row(...data: ColumnDataTypes) {
        this.rows.push(new TextTableRow(this.columns, data));
    }

    get_max_value_line_size(column: TextTableColumn<ColumnDataTypes[number]>) {
        let max_size = 0;
        for (const row of this.rows) {
            let value = row.get_column_value(column);
            if (value === undefined) {
                if ("undefined".length > max_size) max_size = "undefined".length;
                continue;
            }
            let lines = value.split("\n");
            for (const line of lines) {
                let line_length = line.length;
                if (line_length > max_size) max_size = line_length;
                continue;
            }
        }
        return max_size;
    }

    get_column_width(column: TextTableColumn<ColumnDataTypes[number]>) {
        return this.get_max_value_line_size(column) + 2;
    }

    get_max_line_number(row: TextTableRow<ColumnDataTypes>) {
        let max_lines = 0;
        let values = row.get_values();
        for (const value of values) {
            let line_count = value.split("\n").length;
            if (line_count > max_lines) max_lines = line_count;
            continue;
        }
        return max_lines;
    }

    center_string_with_padding(str: string, padding_each_side: number) {
        return `${" ".repeat(padding_each_side)}${str}${" ".repeat(padding_each_side)}`;
    }

    draw_column_header(column: TextTableColumn<ColumnDataTypes[number]>) {}

    draw(): string {}
}*/
/**
 * --aa-
 */
