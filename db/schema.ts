import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const products = sqliteTable(
  "products",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    brand: text("brand").notNull().default(""),
    searchText: text("search_text").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_products_sku_unique").on(table.sku),
    index("idx_products_search_text").on(table.searchText),
  ],
);

export const suppliers = sqliteTable(
  "suppliers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    activeImportId: integer("active_import_id"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("idx_suppliers_name_unique").on(table.name)],
);

export const imports = sqliteTable(
  "imports",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    supplierId: integer("supplier_id").notNull(),
    fileName: text("file_name").notNull(),
    rowCount: integer("row_count").notNull().default(0),
    status: text("status").notNull().default("staging"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_imports_supplier_created").on(table.supplierId, table.createdAt)],
);

export const offers = sqliteTable(
  "offers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    productId: integer("product_id").notNull(),
    supplierId: integer("supplier_id").notNull(),
    importId: integer("import_id").notNull(),
    price: integer("price").notNull(),
    rawJson: text("raw_json").notNull().default("{}"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_offers_import_product_unique").on(table.importId, table.productId),
    index("idx_offers_product").on(table.productId),
    index("idx_offers_supplier_import").on(table.supplierId, table.importId),
  ],
);
