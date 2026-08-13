import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import { AdminHeaderActions, ImportSuccessNotice } from "../app/admin/AdminNavigation";

test("admin actions provide catalog navigation without replacing logout", () => {
  const markup = renderToStaticMarkup(createElement(AdminHeaderActions, { onLogout() {} }));
  assert.match(markup, /href="\/#catalog-title"/);
  assert.match(markup, /В каталог/);
  assert.match(markup, /<button[^>]*>.*Выйти.*<\/button>/);
});

test("successful import offers a direct catalog action", () => {
  const markup = renderToStaticMarkup(createElement(ImportSuccessNotice, { text: "Импортировано 10 товаров." }));
  assert.match(markup, /Импортировано 10 товаров/);
  assert.match(markup, /href="\/#catalog-title"/);
  assert.match(markup, /Посмотреть каталог/);
});
