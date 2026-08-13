import assert from "node:assert/strict";
import test from "node:test";
import { extractProductAttributes } from "../lib/spec-extraction";

test("extracts gaming laptop specifications from compact supplier notation", () => {
  const attrs = extractProductAttributes({
    name: "ASUS ROG Strix",
    description: "CU9 275HX/RTX5080/64G/D5/1T PCIE/18 WQXGA 16:10 1200nt HDR/W11H",
    category: "Ноутбуки",
  });
  assert.equal(attrs.cpu, "Intel Core Ultra 9 275HX");
  assert.equal(attrs.ramGb, 64);
  assert.equal(attrs.memoryType, "DDR5");
  assert.equal(attrs.storageGb, 1024);
  assert.equal(attrs.storageType, "SSD");
  assert.equal(attrs.gpu, "NVIDIA GeForce RTX 5080");
  assert.equal(attrs.screenInches, 18);
  assert.equal(attrs.resolution, "WQXGA");
  assert.equal(attrs.os, "Windows 11 Home");
});

test("extracts office laptop specifications without confusing model numbers", () => {
  const attrs = extractProductAttributes({
    name: "ASUS B5404CVA",
    description: "I5-1335U/16G/512G PCIE/14\" WQXGA IPS/Iris Xe/W11P",
    category: "Ноутбуки",
  });
  assert.equal(attrs.cpu, "Intel Core i5-1335U");
  assert.equal(attrs.ramGb, 16);
  assert.equal(attrs.storageGb, 512);
  assert.equal(attrs.gpu, "Intel Iris Xe");
  assert.equal(attrs.screenInches, 14);
  assert.equal(attrs.os, "Windows 11 Pro");
});
